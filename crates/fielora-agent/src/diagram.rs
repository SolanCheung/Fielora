//! Bounded deterministic layout and static SVG rendering for durable Diagram Artifacts.
//!
//! Semantic authority remains in `fielora-contracts`; every coordinate, SVG
//! element, attribute, and style value in this module is renderer-owned.

use crate::{AgentError, sha256};
use fielora_contracts::{
    DiagramArtifactV1, DiagramEdgeDirection, DiagramEmphasis, DiagramLayoutDirection,
    DiagramNodeKind, DiagramNodeShape,
};
use quick_xml::events::{BytesStart, Event as XmlEvent};
use quick_xml::{Reader as XmlReader, XmlVersion};
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::fmt::Write as _;

pub(crate) const RENDERER_ID: &str = "fielora.diagram.svg";
pub(crate) const RENDERER_VERSION: &str = "0.1.0";
pub(crate) const LAYOUT_ENGINE_ID: &str = "FIELORA_BOUNDED_LAYERED_V1";
pub(crate) const THEME_PROFILE: &str = "LIGHT_NEUTRAL_V1";

const MAX_NODES: usize = 64;
const MAX_EDGES: usize = 128;
const MAX_GROUPS: usize = 16;
const MAX_TOTAL_TEXT_BYTES: usize = 64 * 1024;
const MAX_LABEL_SCALARS: usize = 120;
const MAX_LABEL_BYTES: usize = 1024;
const MAX_DESCRIPTION_SCALARS: usize = 1024;
const MAX_DESCRIPTION_BYTES: usize = 4 * 1024;
const MAX_SVG_BYTES: usize = 2 * 1024 * 1024;
const MAX_VIEWBOX_AXIS: i32 = 16_384;
const MAX_XML_EVENTS: usize = 16_384;

const NODE_WIDTH: i32 = 220;
const NODE_MIN_HEIGHT: i32 = 72;
const NODE_LINE_HEIGHT: i32 = 20;
const RANK_GAP: i32 = 130;
const NODE_GAP: i32 = 28;
const BAND_GAP: i32 = 48;
const COMPONENT_GAP: i32 = 90;
const GROUP_PADDING: i32 = 24;
const EDGE_MARGIN: i32 = 180;
const CANVAS_MARGIN: i32 = 64;
const FONT_FAMILY: &str = "Segoe UI, Microsoft YaHei UI, Noto Sans CJK SC, sans-serif";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct DiagramSemanticFacts {
    pub node_count: usize,
    pub edge_count: usize,
    pub group_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct DiagramRenderFacts {
    pub node_count: usize,
    pub edge_count: usize,
    pub group_count: usize,
    pub view_box_width: i32,
    pub view_box_height: i32,
    pub layout_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RenderedDiagram {
    pub bytes: Vec<u8>,
    pub facts: DiagramRenderFacts,
    expected_text: Vec<String>,
}

#[derive(Debug, Clone)]
struct NodeBox {
    index: usize,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    lines: Vec<String>,
}

impl NodeBox {
    fn right(&self) -> i32 {
        self.x + self.width
    }

    fn bottom(&self) -> i32 {
        self.y + self.height
    }

    fn center(&self) -> (i32, i32) {
        (self.x + self.width / 2, self.y + self.height / 2)
    }
}

#[derive(Debug, Clone)]
struct GroupBox {
    index: usize,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    label_lines: Vec<String>,
}

#[derive(Debug, Clone)]
struct EdgeRoute {
    index: usize,
    points: Vec<(i32, i32)>,
    label_lines: Vec<String>,
}

#[derive(Debug, Clone)]
struct LayoutPlan {
    title_lines: Vec<String>,
    nodes: Vec<NodeBox>,
    groups: Vec<GroupBox>,
    edges: Vec<EdgeRoute>,
    width: i32,
    height: i32,
    layout_sha256: String,
}

pub(crate) fn canonicalize(
    diagram: &mut DiagramArtifactV1,
) -> Result<DiagramSemanticFacts, AgentError> {
    validate(diagram)?;
    diagram
        .nodes
        .sort_by(|left, right| left.node_id.0.cmp(&right.node_id.0));
    diagram
        .edges
        .sort_by(|left, right| left.edge_id.0.cmp(&right.edge_id.0));
    diagram
        .groups
        .sort_by(|left, right| left.group_id.0.cmp(&right.group_id.0));
    for group in &mut diagram.groups {
        group
            .member_node_ids
            .sort_by(|left, right| left.0.cmp(&right.0));
    }
    Ok(DiagramSemanticFacts {
        node_count: diagram.nodes.len(),
        edge_count: diagram.edges.len(),
        group_count: diagram.groups.len(),
    })
}

fn validate(diagram: &DiagramArtifactV1) -> Result<(), AgentError> {
    if diagram.nodes.is_empty()
        || diagram.nodes.len() > MAX_NODES
        || diagram.edges.len() > MAX_EDGES
        || diagram.groups.len() > MAX_GROUPS
    {
        return Err(AgentError::ArtifactContentInvalid);
    }

    let mut text_bytes = 0usize;
    if let Some(title) = &diagram.title {
        admit_label(title, &mut text_bytes)?;
    }
    if let Some(description) = &diagram.description {
        admit_description(description, &mut text_bytes)?;
    }

    let mut node_ids = BTreeSet::new();
    for node in &diagram.nodes {
        admit_local_id(&node.node_id.0)?;
        if !node_ids.insert(node.node_id.0.as_str()) {
            return Err(AgentError::ArtifactContentInvalid);
        }
        admit_label(&node.label, &mut text_bytes)?;
        if let Some(description) = &node.description {
            admit_description(description, &mut text_bytes)?;
        }
    }

    let mut edge_ids = BTreeSet::new();
    for edge in &diagram.edges {
        admit_local_id(&edge.edge_id.0)?;
        if !edge_ids.insert(edge.edge_id.0.as_str())
            || !node_ids.contains(edge.source_node_id.0.as_str())
            || !node_ids.contains(edge.target_node_id.0.as_str())
        {
            return Err(AgentError::ArtifactContentInvalid);
        }
        if let Some(label) = &edge.label {
            admit_label(label, &mut text_bytes)?;
        }
    }

    let mut group_ids = BTreeSet::new();
    let mut grouped_nodes = BTreeSet::new();
    for group in &diagram.groups {
        admit_local_id(&group.group_id.0)?;
        if !group_ids.insert(group.group_id.0.as_str()) || group.member_node_ids.is_empty() {
            return Err(AgentError::ArtifactContentInvalid);
        }
        admit_label(&group.label, &mut text_bytes)?;
        let mut local_members = BTreeSet::new();
        for member in &group.member_node_ids {
            if !node_ids.contains(member.0.as_str())
                || !local_members.insert(member.0.as_str())
                || !grouped_nodes.insert(member.0.as_str())
            {
                return Err(AgentError::ArtifactContentInvalid);
            }
        }
    }

    if text_bytes > MAX_TOTAL_TEXT_BYTES {
        return Err(AgentError::ArtifactContentInvalid);
    }
    Ok(())
}

fn admit_local_id(value: &str) -> Result<(), AgentError> {
    let bytes = value.as_bytes();
    if bytes.is_empty()
        || bytes.len() > 64
        || !bytes[0].is_ascii_lowercase()
        || bytes[1..].iter().any(|byte| {
            !(byte.is_ascii_lowercase() || byte.is_ascii_digit() || *byte == b'_' || *byte == b'-')
        })
    {
        return Err(AgentError::ArtifactContentInvalid);
    }
    Ok(())
}

fn admit_label(value: &str, total: &mut usize) -> Result<(), AgentError> {
    admit_text(value, MAX_LABEL_SCALARS, MAX_LABEL_BYTES, total)
}

fn admit_description(value: &str, total: &mut usize) -> Result<(), AgentError> {
    admit_text(value, MAX_DESCRIPTION_SCALARS, MAX_DESCRIPTION_BYTES, total)
}

fn admit_text(
    value: &str,
    max_scalars: usize,
    max_bytes: usize,
    total: &mut usize,
) -> Result<(), AgentError> {
    let scalar_count = value.chars().count();
    if value.trim().is_empty()
        || scalar_count > max_scalars
        || value.len() > max_bytes
        || value.chars().any(char::is_control)
    {
        return Err(AgentError::ArtifactContentInvalid);
    }
    *total = total
        .checked_add(value.len())
        .ok_or(AgentError::ArtifactContentInvalid)?;
    if *total > MAX_TOTAL_TEXT_BYTES {
        return Err(AgentError::ArtifactContentInvalid);
    }
    Ok(())
}

pub(crate) fn render(diagram: &DiagramArtifactV1) -> Result<RenderedDiagram, AgentError> {
    let mut canonical = diagram.clone();
    let semantic = canonicalize(&mut canonical)?;
    let plan = plan_layout(&canonical)?;
    let mut svg = write_svg(&canonical, &plan)?;
    if svg.len() > MAX_SVG_BYTES {
        return Err(AgentError::DiagramLayoutOverflow);
    }
    let expected_text = expected_rendered_text(&canonical, &plan);
    let facts = DiagramRenderFacts {
        node_count: semantic.node_count,
        edge_count: semantic.edge_count,
        group_count: semantic.group_count,
        view_box_width: plan.width,
        view_box_height: plan.height,
        layout_sha256: plan.layout_sha256,
    };
    validate_svg_bytes(&svg, &facts, &expected_text)?;
    svg.shrink_to_fit();
    Ok(RenderedDiagram {
        bytes: svg,
        facts,
        expected_text,
    })
}

pub(crate) fn reopen(rendered: &RenderedDiagram, bytes: &[u8]) -> Result<(), AgentError> {
    validate_svg_bytes(bytes, &rendered.facts, &rendered.expected_text)
}

fn plan_layout(diagram: &DiagramArtifactV1) -> Result<LayoutPlan, AgentError> {
    let title_lines = wrap_text(diagram.title.as_deref().unwrap_or("Fielora Diagram"), 72, 2)?;
    let index_by_id = diagram
        .nodes
        .iter()
        .enumerate()
        .map(|(index, node)| (node.node_id.0.as_str(), index))
        .collect::<BTreeMap<_, _>>();
    let mut directed = vec![BTreeSet::new(); diagram.nodes.len()];
    let mut undirected = vec![BTreeSet::new(); diagram.nodes.len()];
    for edge in &diagram.edges {
        let source = index_by_id[edge.source_node_id.0.as_str()];
        let target = index_by_id[edge.target_node_id.0.as_str()];
        directed[source].insert(target);
        undirected[source].insert(target);
        undirected[target].insert(source);
    }
    // Group membership is a visual connectivity fact so a single group never
    // straddles independently packed components.
    for group in &diagram.groups {
        let members = group
            .member_node_ids
            .iter()
            .map(|member| index_by_id[member.0.as_str()])
            .collect::<Vec<_>>();
        for pair in members.windows(2) {
            undirected[pair[0]].insert(pair[1]);
            undirected[pair[1]].insert(pair[0]);
        }
    }

    let components = weak_components(&undirected);
    let (sccs, node_to_scc) = strongly_connected_components(&directed);
    let ranks = assign_ranks(&directed, &sccs, &node_to_scc);
    let mut group_for_node = BTreeMap::new();
    for (group_index, group) in diagram.groups.iter().enumerate() {
        for member in &group.member_node_ids {
            group_for_node.insert(index_by_id[member.0.as_str()], group_index);
        }
    }

    let node_lines = diagram
        .nodes
        .iter()
        .map(|node| wrap_text(&node.label, 24, 4))
        .collect::<Result<Vec<_>, _>>()?;
    let node_heights = node_lines
        .iter()
        .map(|lines| NODE_MIN_HEIGHT.max(34 + lines.len() as i32 * NODE_LINE_HEIGHT))
        .collect::<Vec<_>>();

    let mut nodes = Vec::with_capacity(diagram.nodes.len());
    let mut groups = Vec::with_capacity(diagram.groups.len());
    let mut component_cross_offset = EDGE_MARGIN + 50;

    for component in components {
        let component_set = component.iter().copied().collect::<BTreeSet<_>>();
        let min_rank = component
            .iter()
            .map(|index| ranks[*index])
            .min()
            .unwrap_or(0);
        let max_rank = component
            .iter()
            .map(|index| ranks[*index])
            .max()
            .unwrap_or(0);

        let mut band_nodes: BTreeMap<String, Vec<usize>> = BTreeMap::new();
        for node_index in &component {
            let band = group_for_node.get(node_index).map_or_else(
                || "1:ungrouped".to_owned(),
                |group_index| format!("0:{}", diagram.groups[*group_index].group_id.0),
            );
            band_nodes.entry(band).or_default().push(*node_index);
        }
        for members in band_nodes.values_mut() {
            members.sort_by(|left, right| {
                ranks[*left].cmp(&ranks[*right]).then_with(|| {
                    diagram.nodes[*left]
                        .node_id
                        .0
                        .cmp(&diagram.nodes[*right].node_id.0)
                })
            });
        }

        let mut band_cross = component_cross_offset;
        for (band, members) in band_nodes {
            let group_index = band.strip_prefix("0:").and_then(|group_id| {
                diagram
                    .groups
                    .iter()
                    .position(|group| group.group_id.0 == group_id)
            });
            let label_lines = group_index
                .map(|index| wrap_text(&diagram.groups[index].label, 28, 2))
                .transpose()?
                .unwrap_or_default();
            let header = if group_index.is_some() {
                16 + label_lines.len() as i32 * 18
            } else {
                0
            };
            let mut by_rank: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
            for member in &members {
                by_rank.entry(ranks[*member]).or_default().push(*member);
            }
            let band_content_extent = by_rank
                .values()
                .map(|rank_members| {
                    rank_members
                        .iter()
                        .map(|index| node_heights[*index])
                        .sum::<i32>()
                        + NODE_GAP * rank_members.len().saturating_sub(1) as i32
                })
                .max()
                .unwrap_or(NODE_MIN_HEIGHT);
            let band_extent = header
                + if group_index.is_some() {
                    GROUP_PADDING * 2
                } else {
                    0
                }
                + band_content_extent;
            let content_cross = band_cross
                + header
                + if group_index.is_some() {
                    GROUP_PADDING
                } else {
                    0
                };

            for (rank, mut rank_members) in by_rank {
                rank_members.sort_by(|left, right| {
                    diagram.nodes[*left]
                        .node_id
                        .0
                        .cmp(&diagram.nodes[*right].node_id.0)
                });
                let mut cross = content_cross;
                for node_index in rank_members {
                    let primary = EDGE_MARGIN + (rank - min_rank) as i32 * (NODE_WIDTH + RANK_GAP);
                    let (x, y) = match diagram.layout.direction {
                        DiagramLayoutDirection::LeftToRight => (primary, cross),
                        DiagramLayoutDirection::TopToBottom => (cross, primary),
                    };
                    nodes.push(NodeBox {
                        index: node_index,
                        x,
                        y,
                        width: NODE_WIDTH,
                        height: node_heights[node_index],
                        lines: node_lines[node_index].clone(),
                    });
                    cross += node_heights[node_index] + NODE_GAP;
                }
            }

            if let Some(group_index) = group_index {
                let primary_extent =
                    (max_rank - min_rank) as i32 * (NODE_WIDTH + RANK_GAP) + NODE_WIDTH;
                let (x, y, width, height) = match diagram.layout.direction {
                    DiagramLayoutDirection::LeftToRight => (
                        EDGE_MARGIN - GROUP_PADDING,
                        band_cross,
                        primary_extent + GROUP_PADDING * 2,
                        band_extent,
                    ),
                    DiagramLayoutDirection::TopToBottom => (
                        band_cross,
                        EDGE_MARGIN - GROUP_PADDING,
                        band_extent,
                        primary_extent + GROUP_PADDING * 2,
                    ),
                };
                groups.push(GroupBox {
                    index: group_index,
                    x,
                    y,
                    width,
                    height,
                    label_lines,
                });
            }
            band_cross += band_extent + BAND_GAP;
        }
        debug_assert!(component.iter().all(|index| component_set.contains(index)));
        component_cross_offset = band_cross + COMPONENT_GAP;
    }

    nodes.sort_by_key(|node| node.index);
    groups.sort_by_key(|group| group.index);
    let edges = route_edges(diagram, &nodes, &ranks, &index_by_id)?;

    let mut max_x = nodes.iter().map(NodeBox::right).max().unwrap_or(0);
    let mut max_y = nodes.iter().map(NodeBox::bottom).max().unwrap_or(0);
    for group in &groups {
        max_x = max_x.max(group.x + group.width);
        max_y = max_y.max(group.y + group.height);
    }
    for edge in &edges {
        for (x, y) in &edge.points {
            max_x = max_x.max(*x);
            max_y = max_y.max(*y);
            if *x < 0 || *y < 0 {
                return Err(AgentError::DiagramLayoutOverflow);
            }
        }
    }
    let width = max_x
        .checked_add(CANVAS_MARGIN)
        .ok_or(AgentError::DiagramLayoutOverflow)?;
    let height = max_y
        .checked_add(CANVAS_MARGIN)
        .ok_or(AgentError::DiagramLayoutOverflow)?;
    if width <= 0 || height <= 0 || width > MAX_VIEWBOX_AXIS || height > MAX_VIEWBOX_AXIS {
        return Err(AgentError::DiagramLayoutOverflow);
    }

    let mut layout_facts = String::new();
    for line in &title_lines {
        let _ = writeln!(layout_facts, "T:{line}");
    }
    for node in &nodes {
        let _ = writeln!(
            layout_facts,
            "N:{}:{},{},{},{}",
            diagram.nodes[node.index].node_id.0, node.x, node.y, node.width, node.height
        );
    }
    for group in &groups {
        let _ = writeln!(
            layout_facts,
            "G:{}:{},{},{},{}",
            diagram.groups[group.index].group_id.0, group.x, group.y, group.width, group.height
        );
    }
    for edge in &edges {
        let _ = write!(layout_facts, "E:{}", diagram.edges[edge.index].edge_id.0);
        for (x, y) in &edge.points {
            let _ = write!(layout_facts, ":{x},{y}");
        }
        layout_facts.push('\n');
    }
    Ok(LayoutPlan {
        title_lines,
        nodes,
        groups,
        edges,
        width,
        height,
        layout_sha256: sha256(layout_facts.as_bytes()),
    })
}

fn weak_components(adjacency: &[BTreeSet<usize>]) -> Vec<Vec<usize>> {
    let mut visited = vec![false; adjacency.len()];
    let mut components = Vec::new();
    for start in 0..adjacency.len() {
        if visited[start] {
            continue;
        }
        let mut queue = VecDeque::from([start]);
        visited[start] = true;
        let mut component = Vec::new();
        while let Some(node) = queue.pop_front() {
            component.push(node);
            for next in &adjacency[node] {
                if !visited[*next] {
                    visited[*next] = true;
                    queue.push_back(*next);
                }
            }
        }
        component.sort_unstable();
        components.push(component);
    }
    components.sort_by_key(|component| component[0]);
    components
}

fn strongly_connected_components(adjacency: &[BTreeSet<usize>]) -> (Vec<Vec<usize>>, Vec<usize>) {
    struct Tarjan<'a> {
        adjacency: &'a [BTreeSet<usize>],
        next_index: usize,
        indices: Vec<Option<usize>>,
        lowlink: Vec<usize>,
        stack: Vec<usize>,
        on_stack: Vec<bool>,
        components: Vec<Vec<usize>>,
    }
    impl Tarjan<'_> {
        fn visit(&mut self, node: usize) {
            let index = self.next_index;
            self.next_index += 1;
            self.indices[node] = Some(index);
            self.lowlink[node] = index;
            self.stack.push(node);
            self.on_stack[node] = true;
            for next in &self.adjacency[node] {
                if self.indices[*next].is_none() {
                    self.visit(*next);
                    self.lowlink[node] = self.lowlink[node].min(self.lowlink[*next]);
                } else if self.on_stack[*next] {
                    self.lowlink[node] = self.lowlink[node].min(self.indices[*next].unwrap());
                }
            }
            if self.lowlink[node] == self.indices[node].unwrap() {
                let mut component = Vec::new();
                loop {
                    let member = self.stack.pop().unwrap();
                    self.on_stack[member] = false;
                    component.push(member);
                    if member == node {
                        break;
                    }
                }
                component.sort_unstable();
                self.components.push(component);
            }
        }
    }
    let count = adjacency.len();
    let mut state = Tarjan {
        adjacency,
        next_index: 0,
        indices: vec![None; count],
        lowlink: vec![0; count],
        stack: Vec::new(),
        on_stack: vec![false; count],
        components: Vec::new(),
    };
    for node in 0..count {
        if state.indices[node].is_none() {
            state.visit(node);
        }
    }
    state.components.sort_by_key(|component| component[0]);
    let mut node_to_scc = vec![0usize; count];
    for (scc, members) in state.components.iter().enumerate() {
        for member in members {
            node_to_scc[*member] = scc;
        }
    }
    (state.components, node_to_scc)
}

fn assign_ranks(
    adjacency: &[BTreeSet<usize>],
    sccs: &[Vec<usize>],
    node_to_scc: &[usize],
) -> Vec<usize> {
    let mut dag = vec![BTreeSet::new(); sccs.len()];
    let mut indegree = vec![0usize; sccs.len()];
    for (source, targets) in adjacency.iter().enumerate() {
        for target in targets {
            let from = node_to_scc[source];
            let to = node_to_scc[*target];
            if from != to && dag[from].insert(to) {
                indegree[to] += 1;
            }
        }
    }
    let mut ready = BTreeSet::new();
    for (scc, degree) in indegree.iter().enumerate() {
        if *degree == 0 {
            ready.insert((sccs[scc][0], scc));
        }
    }
    let mut scc_rank = vec![0usize; sccs.len()];
    while let Some((_, scc)) = ready.pop_first() {
        for next in &dag[scc] {
            scc_rank[*next] = scc_rank[*next].max(scc_rank[scc] + 1);
            indegree[*next] -= 1;
            if indegree[*next] == 0 {
                ready.insert((sccs[*next][0], *next));
            }
        }
    }
    node_to_scc.iter().map(|scc| scc_rank[*scc]).collect()
}

fn route_edges(
    diagram: &DiagramArtifactV1,
    nodes: &[NodeBox],
    ranks: &[usize],
    index_by_id: &BTreeMap<&str, usize>,
) -> Result<Vec<EdgeRoute>, AgentError> {
    let by_index = nodes
        .iter()
        .map(|node| (node.index, node))
        .collect::<BTreeMap<_, _>>();
    let mut parallel = BTreeMap::<(usize, usize), usize>::new();
    let mut routes = Vec::with_capacity(diagram.edges.len());
    for (edge_index, edge) in diagram.edges.iter().enumerate() {
        let source_index = index_by_id[edge.source_node_id.0.as_str()];
        let target_index = index_by_id[edge.target_node_id.0.as_str()];
        let source = by_index[&source_index];
        let target = by_index[&target_index];
        let lane = parallel.entry((source_index, target_index)).or_default();
        let lane_offset = *lane as i32 * 12;
        *lane += 1;
        let points = if source_index == target_index {
            let (cx, _) = source.center();
            vec![
                (source.right(), source.y + source.height / 2),
                (
                    source.right() + 42 + lane_offset,
                    source.y + source.height / 2,
                ),
                (
                    source.right() + 42 + lane_offset,
                    source.y - 34 - lane_offset,
                ),
                (cx, source.y - 34 - lane_offset),
                (cx, source.y),
            ]
        } else if ranks[target_index] > ranks[source_index] {
            match diagram.layout.direction {
                DiagramLayoutDirection::LeftToRight => {
                    let start = (source.right(), source.y + source.height / 2);
                    let end = (target.x, target.y + target.height / 2);
                    let mid = (start.0 + end.0) / 2 + lane_offset;
                    vec![start, (mid, start.1), (mid, end.1), end]
                }
                DiagramLayoutDirection::TopToBottom => {
                    let start = (source.x + source.width / 2, source.bottom());
                    let end = (target.x + target.width / 2, target.y);
                    let mid = (start.1 + end.1) / 2 + lane_offset;
                    vec![start, (start.0, mid), (end.0, mid), end]
                }
            }
        } else {
            let feedback_lane = (edge_index % 8) as i32;
            match diagram.layout.direction {
                DiagramLayoutDirection::LeftToRight => {
                    let start = (source.x, source.y + source.height / 2);
                    let end = (target.right(), target.y + target.height / 2);
                    let outer_y = source.y.min(target.y) - 34 - feedback_lane * 14;
                    vec![
                        start,
                        (start.0 - 28, start.1),
                        (start.0 - 28, outer_y),
                        (end.0 + 28, outer_y),
                        (end.0 + 28, end.1),
                        end,
                    ]
                }
                DiagramLayoutDirection::TopToBottom => {
                    let start = (source.x + source.width / 2, source.y);
                    let end = (target.x + target.width / 2, target.bottom());
                    let outer_x = source.x.min(target.x) - 34 - feedback_lane * 14;
                    vec![
                        start,
                        (start.0, start.1 - 28),
                        (outer_x, start.1 - 28),
                        (outer_x, end.1 + 28),
                        (end.0, end.1 + 28),
                        end,
                    ]
                }
            }
        };
        let label_lines = edge
            .label
            .as_ref()
            .map(|label| wrap_text(label, 36, 2))
            .transpose()?
            .unwrap_or_default();
        routes.push(EdgeRoute {
            index: edge_index,
            points,
            label_lines,
        });
    }
    Ok(routes)
}

fn wrap_text(value: &str, max_units: usize, max_lines: usize) -> Result<Vec<String>, AgentError> {
    let mut lines = vec![String::new()];
    let mut current_units = 0usize;
    for character in value.chars() {
        let units = if character.is_ascii() { 1 } else { 2 };
        if current_units + units > max_units && !lines.last().unwrap().is_empty() {
            if lines.len() >= max_lines {
                return Err(AgentError::DiagramLayoutOverflow);
            }
            lines.push(String::new());
            current_units = 0;
        }
        lines.last_mut().unwrap().push(character);
        current_units += units;
    }
    if lines.iter().any(String::is_empty) {
        return Err(AgentError::DiagramLayoutOverflow);
    }
    Ok(lines)
}

fn write_svg(diagram: &DiagramArtifactV1, plan: &LayoutPlan) -> Result<Vec<u8>, AgentError> {
    let mut output = String::with_capacity(32 * 1024);
    writeln!(output, "<?xml version=\"1.0\" encoding=\"UTF-8\"?>")
        .map_err(|_| AgentError::IoFailed)?;
    writeln!(
        output,
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {} {}\" width=\"{}\" height=\"{}\" role=\"img\" aria-labelledby=\"diagram-title diagram-desc\">",
        plan.width, plan.height, plan.width, plan.height
    )
    .map_err(|_| AgentError::IoFailed)?;
    let title = diagram.title.as_deref().unwrap_or("Fielora Diagram");
    let description = diagram
        .description
        .as_deref()
        .unwrap_or("Static Fielora Diagram Artifact export.");
    writeln!(
        output,
        "<title id=\"diagram-title\">{}</title>",
        xml_escape(title)
    )
    .map_err(|_| AgentError::IoFailed)?;
    writeln!(
        output,
        "<desc id=\"diagram-desc\">{}</desc>",
        xml_escape(description)
    )
    .map_err(|_| AgentError::IoFailed)?;
    writeln!(output, "<rect x=\"0\" y=\"0\" width=\"{}\" height=\"{}\" fill=\"#F8FAFC\" stroke=\"none\" stroke-width=\"0\"/>", plan.width, plan.height)
        .map_err(|_| AgentError::IoFailed)?;
    write_text_lines(
        &mut output,
        CANVAS_MARGIN,
        44,
        &plan.title_lines,
        "#0F172A",
        24,
        true,
        "start",
    )?;

    for group_box in &plan.groups {
        let group = &diagram.groups[group_box.index];
        writeln!(
            output,
            "<g id=\"group-{:03}\" data-fielora-role=\"group\">",
            group_box.index
        )
        .map_err(|_| AgentError::IoFailed)?;
        writeln!(output, "<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" rx=\"16\" ry=\"16\" fill=\"#EEF2FF\" stroke=\"#94A3B8\" stroke-width=\"2\" opacity=\"0.72\"/>", group_box.x, group_box.y, group_box.width, group_box.height)
            .map_err(|_| AgentError::IoFailed)?;
        write_text_lines(
            &mut output,
            group_box.x + 18,
            group_box.y + 25,
            &group_box.label_lines,
            "#334155",
            15,
            true,
            "start",
        )?;
        writeln!(output, "</g>").map_err(|_| AgentError::IoFailed)?;
        debug_assert!(!group.label.is_empty());
    }

    for route in &plan.edges {
        let edge = &diagram.edges[route.index];
        let emphasis = edge
            .presentation
            .map_or(DiagramEmphasis::Normal, |value| value.emphasis);
        let (stroke, width, opacity) = match emphasis {
            DiagramEmphasis::Normal => ("#64748B", 2, "1"),
            DiagramEmphasis::Emphasis => ("#2563EB", 3, "1"),
        };
        writeln!(
            output,
            "<g id=\"edge-{:03}\" data-fielora-role=\"edge\">",
            route.index
        )
        .map_err(|_| AgentError::IoFailed)?;
        writeln!(output, "<polyline points=\"{}\" fill=\"none\" stroke=\"{}\" stroke-width=\"{}\" opacity=\"{}\"/>", points_attribute(&route.points), stroke, width, opacity)
            .map_err(|_| AgentError::IoFailed)?;
        if matches!(
            edge.direction,
            DiagramEdgeDirection::Forward | DiagramEdgeDirection::Bidirectional
        ) {
            write_arrow(
                &mut output,
                route.points[route.points.len() - 1],
                route.points[route.points.len() - 2],
                stroke,
            )?;
        }
        if edge.direction == DiagramEdgeDirection::Bidirectional {
            write_arrow(&mut output, route.points[0], route.points[1], stroke)?;
        }
        if !route.label_lines.is_empty() {
            let anchor = route.points[route.points.len() / 2];
            write_text_lines(
                &mut output,
                anchor.0,
                anchor.1 - 8,
                &route.label_lines,
                "#334155",
                13,
                false,
                "middle",
            )?;
        }
        writeln!(output, "</g>").map_err(|_| AgentError::IoFailed)?;
    }

    for node_box in &plan.nodes {
        let node = &diagram.nodes[node_box.index];
        let presentation = node.presentation;
        let emphasis = presentation.map_or(DiagramEmphasis::Normal, |value| value.emphasis);
        let shape = presentation.map_or(DiagramNodeShape::Auto, |value| value.shape);
        let shape = if shape == DiagramNodeShape::Auto {
            match node.semantic_kind {
                DiagramNodeKind::Person => DiagramNodeShape::Ellipse,
                DiagramNodeKind::Process | DiagramNodeKind::Service => {
                    DiagramNodeShape::RoundedRect
                }
                _ => DiagramNodeShape::Rectangle,
            }
        } else {
            shape
        };
        let (fill, stroke, stroke_width, weight) = match emphasis {
            DiagramEmphasis::Normal => ("#FFFFFF", "#475569", 2, false),
            DiagramEmphasis::Emphasis => ("#DBEAFE", "#1D4ED8", 3, true),
        };
        writeln!(
            output,
            "<g id=\"node-{:03}\" data-fielora-role=\"node\">",
            node_box.index
        )
        .map_err(|_| AgentError::IoFailed)?;
        if let Some(description) = &node.description {
            writeln!(output, "<desc>{}</desc>", xml_escape(description))
                .map_err(|_| AgentError::IoFailed)?;
        }
        match shape {
            DiagramNodeShape::Ellipse => {
                writeln!(output, "<ellipse cx=\"{}\" cy=\"{}\" rx=\"{}\" ry=\"{}\" fill=\"{}\" stroke=\"{}\" stroke-width=\"{}\"/>", node_box.x + node_box.width / 2, node_box.y + node_box.height / 2, node_box.width / 2, node_box.height / 2, fill, stroke, stroke_width)
                    .map_err(|_| AgentError::IoFailed)?;
            }
            DiagramNodeShape::Rectangle
            | DiagramNodeShape::RoundedRect
            | DiagramNodeShape::Auto => {
                let radius = if shape == DiagramNodeShape::RoundedRect {
                    14
                } else {
                    2
                };
                writeln!(output, "<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" rx=\"{}\" ry=\"{}\" fill=\"{}\" stroke=\"{}\" stroke-width=\"{}\"/>", node_box.x, node_box.y, node_box.width, node_box.height, radius, radius, fill, stroke, stroke_width)
                    .map_err(|_| AgentError::IoFailed)?;
            }
        }
        let first_y = node_box.y + node_box.height / 2
            - ((node_box.lines.len() as i32 - 1) * NODE_LINE_HEIGHT) / 2;
        write_text_lines(
            &mut output,
            node_box.x + node_box.width / 2,
            first_y,
            &node_box.lines,
            "#0F172A",
            15,
            weight,
            "middle",
        )?;
        writeln!(output, "</g>").map_err(|_| AgentError::IoFailed)?;
    }
    writeln!(output, "</svg>").map_err(|_| AgentError::IoFailed)?;
    Ok(output.into_bytes())
}

#[allow(clippy::too_many_arguments)]
fn write_text_lines(
    output: &mut String,
    x: i32,
    y: i32,
    lines: &[String],
    fill: &str,
    font_size: i32,
    bold: bool,
    anchor: &str,
) -> Result<(), AgentError> {
    writeln!(output, "<text x=\"{}\" y=\"{}\" fill=\"{}\" font-family=\"{}\" font-size=\"{}\" font-weight=\"{}\" text-anchor=\"{}\" dominant-baseline=\"middle\">", x, y, fill, FONT_FAMILY, font_size, if bold { "700" } else { "500" }, anchor)
        .map_err(|_| AgentError::IoFailed)?;
    for (index, line) in lines.iter().enumerate() {
        writeln!(
            output,
            "<tspan x=\"{}\" dy=\"{}\">{}</tspan>",
            x,
            if index == 0 { 0 } else { NODE_LINE_HEIGHT },
            xml_escape(line)
        )
        .map_err(|_| AgentError::IoFailed)?;
    }
    writeln!(output, "</text>").map_err(|_| AgentError::IoFailed)
}

fn write_arrow(
    output: &mut String,
    tip: (i32, i32),
    previous: (i32, i32),
    color: &str,
) -> Result<(), AgentError> {
    let (x, y) = tip;
    let points = if x > previous.0 {
        vec![(x, y), (x - 10, y - 5), (x - 10, y + 5)]
    } else if x < previous.0 {
        vec![(x, y), (x + 10, y - 5), (x + 10, y + 5)]
    } else if y > previous.1 {
        vec![(x, y), (x - 5, y - 10), (x + 5, y - 10)]
    } else {
        vec![(x, y), (x - 5, y + 10), (x + 5, y + 10)]
    };
    writeln!(
        output,
        "<polygon points=\"{}\" fill=\"{}\" stroke=\"{}\"/>",
        points_attribute(&points),
        color,
        color
    )
    .map_err(|_| AgentError::IoFailed)
}

fn points_attribute(points: &[(i32, i32)]) -> String {
    points
        .iter()
        .map(|(x, y)| format!("{x},{y}"))
        .collect::<Vec<_>>()
        .join(" ")
}

fn xml_escape(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for character in value.chars() {
        match character {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&apos;"),
            _ => escaped.push(character),
        }
    }
    escaped
}

fn expected_rendered_text(diagram: &DiagramArtifactV1, plan: &LayoutPlan) -> Vec<String> {
    let mut expected = vec![
        diagram
            .title
            .clone()
            .unwrap_or_else(|| "Fielora Diagram".into()),
        diagram
            .description
            .clone()
            .unwrap_or_else(|| "Static Fielora Diagram Artifact export.".into()),
    ];
    expected.extend(plan.title_lines.iter().cloned());
    for group in &plan.groups {
        expected.extend(group.label_lines.iter().cloned());
    }
    for edge in &plan.edges {
        expected.extend(edge.label_lines.iter().cloned());
    }
    for node in &plan.nodes {
        if let Some(description) = &diagram.nodes[node.index].description {
            expected.push(description.clone());
        }
        expected.extend(node.lines.iter().cloned());
    }
    expected
}

fn validate_svg_bytes(
    bytes: &[u8],
    expected: &DiagramRenderFacts,
    expected_text: &[String],
) -> Result<(), AgentError> {
    if bytes.is_empty() || bytes.len() > MAX_SVG_BYTES {
        return Err(AgentError::IoFailed);
    }
    let mut reader = XmlReader::from_reader(bytes);
    reader.config_mut().check_end_names = true;
    let mut stack: Vec<(String, String)> = Vec::new();
    let mut events = 0usize;
    let mut root_seen = false;
    let mut root_closed = false;
    let mut role_counts = BTreeMap::<String, usize>::new();
    let mut renderer_ids = BTreeSet::new();
    let mut rendered_text = Vec::new();
    let mut view_box = None;

    loop {
        events += 1;
        if events > MAX_XML_EVENTS {
            return Err(AgentError::IoFailed);
        }
        match reader.read_event().map_err(|_| AgentError::IoFailed)? {
            XmlEvent::Decl(_) if !root_seen && stack.is_empty() => {}
            XmlEvent::Start(element) => {
                let name = admit_svg_element(
                    &reader,
                    &element,
                    &mut role_counts,
                    &mut renderer_ids,
                    &mut view_box,
                )?;
                if !root_seen {
                    if name != "svg" {
                        return Err(AgentError::IoFailed);
                    }
                    root_seen = true;
                } else if root_closed || name == "svg" {
                    return Err(AgentError::IoFailed);
                }
                stack.push((name, String::new()));
                if stack.len() > 16 {
                    return Err(AgentError::IoFailed);
                }
            }
            XmlEvent::Empty(element) => {
                if !root_seen || root_closed {
                    return Err(AgentError::IoFailed);
                }
                let name = admit_svg_element(
                    &reader,
                    &element,
                    &mut role_counts,
                    &mut renderer_ids,
                    &mut view_box,
                )?;
                if name == "svg" {
                    return Err(AgentError::IoFailed);
                }
            }
            XmlEvent::Text(text) => {
                if let Some((_, value)) = stack.last_mut() {
                    value.push_str(&text.decode().map_err(|_| AgentError::IoFailed)?);
                } else if !text
                    .decode()
                    .map_err(|_| AgentError::IoFailed)?
                    .trim()
                    .is_empty()
                {
                    return Err(AgentError::IoFailed);
                }
            }
            XmlEvent::GeneralRef(reference) => {
                let decoded = match reference
                    .decode()
                    .map_err(|_| AgentError::IoFailed)?
                    .as_ref()
                {
                    "amp" => '&',
                    "lt" => '<',
                    "gt" => '>',
                    "quot" => '"',
                    "apos" => '\'',
                    _ => return Err(AgentError::IoFailed),
                };
                stack
                    .last_mut()
                    .ok_or(AgentError::IoFailed)?
                    .1
                    .push(decoded);
            }
            XmlEvent::End(end) => {
                let end_name = end.name();
                let name =
                    std::str::from_utf8(end_name.as_ref()).map_err(|_| AgentError::IoFailed)?;
                let (opened, value) = stack.pop().ok_or(AgentError::IoFailed)?;
                if opened != name {
                    return Err(AgentError::IoFailed);
                }
                if matches!(name, "title" | "desc" | "tspan") && !value.is_empty() {
                    rendered_text.push(value);
                }
                if name == "svg" {
                    root_closed = true;
                }
            }
            XmlEvent::Eof => break,
            XmlEvent::DocType(_)
            | XmlEvent::PI(_)
            | XmlEvent::CData(_)
            | XmlEvent::Comment(_)
            | XmlEvent::Decl(_) => return Err(AgentError::IoFailed),
        }
    }

    let (width, height) = view_box.ok_or(AgentError::IoFailed)?;
    if !root_seen
        || !root_closed
        || !stack.is_empty()
        || width != expected.view_box_width
        || height != expected.view_box_height
        || role_counts.get("node").copied().unwrap_or(0) != expected.node_count
        || role_counts.get("edge").copied().unwrap_or(0) != expected.edge_count
        || role_counts.get("group").copied().unwrap_or(0) != expected.group_count
        || !renderer_ids.contains("diagram-title")
        || !renderer_ids.contains("diagram-desc")
    {
        return Err(AgentError::IoFailed);
    }
    let actual_counts = rendered_text
        .into_iter()
        .fold(BTreeMap::new(), |mut counts, text| {
            *counts.entry(text).or_insert(0usize) += 1;
            counts
        });
    let expected_counts =
        expected_text
            .iter()
            .cloned()
            .fold(BTreeMap::new(), |mut counts, text| {
                *counts.entry(text).or_insert(0usize) += 1;
                counts
            });
    if expected_counts
        .iter()
        .any(|(text, count)| actual_counts.get(text).copied().unwrap_or(0) < *count)
    {
        return Err(AgentError::IoFailed);
    }
    Ok(())
}

fn admit_svg_element(
    reader: &XmlReader<&[u8]>,
    element: &BytesStart<'_>,
    role_counts: &mut BTreeMap<String, usize>,
    renderer_ids: &mut BTreeSet<String>,
    view_box: &mut Option<(i32, i32)>,
) -> Result<String, AgentError> {
    let name = std::str::from_utf8(element.name().as_ref())
        .map_err(|_| AgentError::IoFailed)?
        .to_owned();
    if !matches!(
        name.as_str(),
        "svg"
            | "g"
            | "rect"
            | "ellipse"
            | "polyline"
            | "polygon"
            | "text"
            | "tspan"
            | "title"
            | "desc"
    ) {
        return Err(AgentError::IoFailed);
    }
    let allowed = match name.as_str() {
        "svg" => &[
            "xmlns",
            "viewBox",
            "width",
            "height",
            "role",
            "aria-labelledby",
        ][..],
        "g" => &["id", "data-fielora-role"],
        "rect" => &[
            "x",
            "y",
            "width",
            "height",
            "rx",
            "ry",
            "fill",
            "stroke",
            "stroke-width",
            "opacity",
        ],
        "ellipse" => &[
            "cx",
            "cy",
            "rx",
            "ry",
            "fill",
            "stroke",
            "stroke-width",
            "opacity",
        ],
        "polyline" => &["points", "fill", "stroke", "stroke-width", "opacity"],
        "polygon" => &["points", "fill", "stroke"],
        "text" => &[
            "x",
            "y",
            "fill",
            "font-family",
            "font-size",
            "font-weight",
            "text-anchor",
            "dominant-baseline",
        ],
        "tspan" => &["x", "dy"],
        "title" | "desc" => &["id"],
        _ => unreachable!(),
    };
    let mut seen = BTreeSet::new();
    let mut values = BTreeMap::new();
    for attribute in element.attributes().with_checks(true) {
        let attribute = attribute.map_err(|_| AgentError::IoFailed)?;
        let key = std::str::from_utf8(attribute.key.as_ref())
            .map_err(|_| AgentError::IoFailed)?
            .to_owned();
        if !allowed.contains(&key.as_str())
            || !seen.insert(key.clone())
            || key.eq_ignore_ascii_case("style")
            || key.to_ascii_lowercase().starts_with("on")
            || key.to_ascii_lowercase().contains("href")
        {
            return Err(AgentError::IoFailed);
        }
        let value = attribute
            .decoded_and_normalized_value(XmlVersion::Implicit1_0, reader.decoder())
            .map_err(|_| AgentError::IoFailed)?;
        if value.len() > 2048 {
            return Err(AgentError::IoFailed);
        }
        admit_svg_attribute(&name, &key, &value, role_counts, renderer_ids, view_box)?;
        values.insert(key, value.into_owned());
    }
    if name == "svg" {
        let required = [
            "xmlns",
            "viewBox",
            "width",
            "height",
            "role",
            "aria-labelledby",
        ];
        if required.iter().any(|key| !seen.contains(*key)) {
            return Err(AgentError::IoFailed);
        }
        let (view_width, view_height) = view_box.ok_or(AgentError::IoFailed)?;
        if values
            .get("width")
            .and_then(|value| value.parse::<i32>().ok())
            != Some(view_width)
            || values
                .get("height")
                .and_then(|value| value.parse::<i32>().ok())
                != Some(view_height)
        {
            return Err(AgentError::IoFailed);
        }
    }
    if name == "g" {
        let id = values.get("id").ok_or(AgentError::IoFailed)?;
        let role = values
            .get("data-fielora-role")
            .ok_or(AgentError::IoFailed)?;
        let prefix = match role.as_str() {
            "node" => "node-",
            "edge" => "edge-",
            "group" => "group-",
            _ => return Err(AgentError::IoFailed),
        };
        if !id.starts_with(prefix) {
            return Err(AgentError::IoFailed);
        }
    }
    Ok(name)
}

fn admit_svg_attribute(
    element: &str,
    key: &str,
    value: &str,
    role_counts: &mut BTreeMap<String, usize>,
    renderer_ids: &mut BTreeSet<String>,
    view_box: &mut Option<(i32, i32)>,
) -> Result<(), AgentError> {
    match key {
        "xmlns" if element == "svg" && value == "http://www.w3.org/2000/svg" => Ok(()),
        "viewBox" if element == "svg" => {
            let fields = value
                .split_ascii_whitespace()
                .map(str::parse::<i32>)
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| AgentError::IoFailed)?;
            if fields.len() != 4
                || fields[0] != 0
                || fields[1] != 0
                || fields[2] <= 0
                || fields[3] <= 0
                || fields[2] > MAX_VIEWBOX_AXIS
                || fields[3] > MAX_VIEWBOX_AXIS
                || view_box.replace((fields[2], fields[3])).is_some()
            {
                return Err(AgentError::IoFailed);
            }
            Ok(())
        }
        "points" => {
            let points = value.split_ascii_whitespace().collect::<Vec<_>>();
            if points.len() < 3
                || points.iter().any(|point| {
                    let coordinates = point.split(',').collect::<Vec<_>>();
                    coordinates.len() != 2
                        || coordinates
                            .iter()
                            .any(|coordinate| coordinate.parse::<i32>().is_err())
                })
            {
                return Err(AgentError::IoFailed);
            }
            Ok(())
        }
        "id" => {
            if value.is_empty()
                || value.len() > 64
                || !value
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
                || !renderer_ids.insert(value.to_owned())
            {
                return Err(AgentError::IoFailed);
            }
            Ok(())
        }
        "data-fielora-role" if matches!(value, "node" | "edge" | "group") => {
            *role_counts.entry(value.to_owned()).or_default() += 1;
            Ok(())
        }
        "role" if value == "img" => Ok(()),
        "aria-labelledby" if value == "diagram-title diagram-desc" => Ok(()),
        "font-family" if value == FONT_FAMILY => Ok(()),
        "font-weight" if matches!(value, "500" | "700") => Ok(()),
        "text-anchor" if matches!(value, "start" | "middle") => Ok(()),
        "dominant-baseline" if value == "middle" => Ok(()),
        "fill" | "stroke"
            if matches!(
                value,
                "none"
                    | "#F8FAFC"
                    | "#EEF2FF"
                    | "#94A3B8"
                    | "#334155"
                    | "#64748B"
                    | "#2563EB"
                    | "#FFFFFF"
                    | "#475569"
                    | "#DBEAFE"
                    | "#1D4ED8"
                    | "#0F172A"
            ) =>
        {
            Ok(())
        }
        "opacity" => {
            let number = value.parse::<f64>().map_err(|_| AgentError::IoFailed)?;
            if !number.is_finite() || !(0.0..=1.0).contains(&number) {
                return Err(AgentError::IoFailed);
            }
            Ok(())
        }
        "x" | "y" | "width" | "height" | "rx" | "ry" | "cx" | "cy" | "stroke-width"
        | "font-size" | "dy" => {
            let number = value.parse::<i32>().map_err(|_| AgentError::IoFailed)?;
            if !(0..=MAX_VIEWBOX_AXIS).contains(&number) {
                return Err(AgentError::IoFailed);
            }
            Ok(())
        }
        _ => Err(AgentError::IoFailed),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use fielora_contracts::{
        DiagramEdgePresentationIntentV1, DiagramEdgeV1, DiagramGroupId, DiagramGroupKind,
        DiagramGroupV1, DiagramLayoutIntentV1, DiagramLayoutStrategy, DiagramNodeId,
        DiagramNodePresentationIntentV1, DiagramNodeV1, DiagramRelationKind,
    };

    fn node(id: &str, label: &str) -> DiagramNodeV1 {
        DiagramNodeV1 {
            node_id: DiagramNodeId::new(id),
            label: label.into(),
            description: None,
            semantic_kind: DiagramNodeKind::Service,
            presentation: Some(DiagramNodePresentationIntentV1 {
                shape: DiagramNodeShape::Auto,
                emphasis: DiagramEmphasis::Normal,
            }),
        }
    }

    fn edge(id: &str, source: &str, target: &str) -> DiagramEdgeV1 {
        DiagramEdgeV1 {
            edge_id: fielora_contracts::DiagramEdgeId::new(id),
            source_node_id: DiagramNodeId::new(source),
            target_node_id: DiagramNodeId::new(target),
            label: Some("调用 / calls".into()),
            relation_kind: DiagramRelationKind::Flow,
            direction: DiagramEdgeDirection::Forward,
            presentation: Some(DiagramEdgePresentationIntentV1 {
                emphasis: DiagramEmphasis::Normal,
            }),
        }
    }

    fn representative() -> DiagramArtifactV1 {
        let ids = [
            ("model", "Model 模型"),
            ("context", "Context 上下文"),
            ("governance", "Governance"),
            ("execution", "Execution 执行"),
            ("verification", "Verification"),
            ("mcp", "MCP"),
            ("web", "Web Intelligence"),
            ("artifact", "Artifact 工件"),
            ("credential", "Credential"),
            ("detached", "Detached 组件"),
        ];
        DiagramArtifactV1 {
            title: Some("Fielora 架构 <Model + Harness + Tools>".into()),
            description: Some("Static & deterministic; no external resources.".into()),
            layout: DiagramLayoutIntentV1 {
                strategy: DiagramLayoutStrategy::LayeredAuto,
                direction: DiagramLayoutDirection::LeftToRight,
            },
            nodes: ids.into_iter().map(|(id, label)| node(id, label)).collect(),
            edges: vec![
                edge("e_model_context", "model", "context"),
                edge("e_context_governance", "context", "governance"),
                edge("e_governance_execution", "governance", "execution"),
                edge("e_execution_mcp", "execution", "mcp"),
                edge("e_execution_web", "execution", "web"),
                edge("e_execution_artifact", "execution", "artifact"),
                edge("e_artifact_verification", "artifact", "verification"),
                edge("e_credential_mcp", "credential", "mcp"),
                edge("e_cross", "context", "artifact"),
            ],
            groups: vec![
                DiagramGroupV1 {
                    group_id: DiagramGroupId::new("reasoning"),
                    label: "Reasoning 推理".into(),
                    semantic_kind: DiagramGroupKind::Layer,
                    member_node_ids: vec![DiagramNodeId::new("model")],
                },
                DiagramGroupV1 {
                    group_id: DiagramGroupId::new("harness"),
                    label: "Harness".into(),
                    semantic_kind: DiagramGroupKind::Boundary,
                    member_node_ids: ["context", "governance", "execution", "verification"]
                        .into_iter()
                        .map(DiagramNodeId::new)
                        .collect(),
                },
                DiagramGroupV1 {
                    group_id: DiagramGroupId::new("tools"),
                    label: "Tools 工具".into(),
                    semantic_kind: DiagramGroupKind::Cluster,
                    member_node_ids: ["mcp", "web", "artifact", "credential"]
                        .into_iter()
                        .map(DiagramNodeId::new)
                        .collect(),
                },
            ],
        }
    }

    #[test]
    fn representative_graph_is_deterministic_cjk_safe_and_structurally_reopened() {
        let diagram = representative();
        let first = render(&diagram).unwrap();
        let second = render(&diagram).unwrap();
        assert_eq!(first.bytes, second.bytes);
        assert_eq!(first.facts.layout_sha256, second.facts.layout_sha256);
        assert_eq!(first.facts.node_count, 10);
        assert_eq!(first.facts.edge_count, 9);
        assert_eq!(first.facts.group_count, 3);
        reopen(&first, &first.bytes).unwrap();
        let svg = String::from_utf8(first.bytes).unwrap();
        assert!(svg.contains("Fielora 架构 &lt;Model + Harness + Tools&gt;"));
        assert!(svg.contains("Context 上下文"));
        assert!(!svg.contains("<script"));
    }

    #[test]
    fn cycles_self_parallel_cross_edges_and_disconnected_nodes_render() {
        let mut diagram = DiagramArtifactV1 {
            title: Some("General graph".into()),
            description: None,
            layout: DiagramLayoutIntentV1 {
                strategy: DiagramLayoutStrategy::LayeredAuto,
                direction: DiagramLayoutDirection::TopToBottom,
            },
            nodes: ["a", "b", "c", "detached"]
                .into_iter()
                .map(|id| node(id, id))
                .collect(),
            edges: vec![
                edge("e_ab", "a", "b"),
                edge("e_bc", "b", "c"),
                edge("e_ca", "c", "a"),
                edge("e_self", "a", "a"),
                edge("e_parallel_a", "a", "b"),
                edge("e_parallel_b", "a", "b"),
            ],
            groups: vec![],
        };
        diagram.edges[4].direction = DiagramEdgeDirection::Bidirectional;
        diagram.edges[5].direction = DiagramEdgeDirection::None;
        let rendered = render(&diagram).unwrap();
        assert_eq!(rendered.facts.node_count, 4);
        assert_eq!(rendered.facts.edge_count, 6);
        reopen(&rendered, &rendered.bytes).unwrap();
    }

    #[test]
    fn graph_and_group_validation_fail_closed() {
        let base = representative();
        let mut cases = Vec::new();
        let mut duplicate_node = base.clone();
        duplicate_node.nodes[1].node_id = duplicate_node.nodes[0].node_id.clone();
        cases.push(duplicate_node);
        let mut missing_endpoint = base.clone();
        missing_endpoint.edges[0].target_node_id = DiagramNodeId::new("missing");
        cases.push(missing_endpoint);
        let mut empty_group = base.clone();
        empty_group.groups[0].member_node_ids.clear();
        cases.push(empty_group);
        let mut missing_member = base.clone();
        missing_member.groups[0].member_node_ids = vec![DiagramNodeId::new("missing")];
        cases.push(missing_member);
        let mut duplicate_member = base.clone();
        duplicate_member.groups[0]
            .member_node_ids
            .push(DiagramNodeId::new("model"));
        cases.push(duplicate_member);
        let mut multiple_groups = base;
        multiple_groups.groups[1]
            .member_node_ids
            .push(DiagramNodeId::new("model"));
        cases.push(multiple_groups);
        for mut invalid in cases {
            assert_eq!(
                canonicalize(&mut invalid),
                Err(AgentError::ArtifactContentInvalid)
            );
        }
    }

    #[test]
    fn array_order_is_not_semantic_or_visual() {
        let mut first = representative();
        let mut reordered = first.clone();
        reordered.nodes.reverse();
        reordered.edges.reverse();
        reordered.groups.reverse();
        for group in &mut reordered.groups {
            group.member_node_ids.reverse();
        }
        canonicalize(&mut first).unwrap();
        canonicalize(&mut reordered).unwrap();
        assert_eq!(first, reordered);
        assert_eq!(
            render(&first).unwrap().bytes,
            render(&reordered).unwrap().bytes
        );
    }

    #[test]
    fn hostile_text_is_only_escaped_visible_text() {
        let mut diagram = representative();
        diagram.nodes[0].label = "<script>alert(1)</script>".into();
        diagram.nodes[1].label = "<foreignObject>".into();
        diagram.nodes[2].label = "& < > \" '".into();
        diagram.nodes[3].label = "javascript:".into();
        diagram.nodes[4].label = "https://example.com".into();
        diagram.nodes[5].label = "file:///private".into();
        diagram.nodes[6].label = "onload= style=".into();
        let rendered = render(&diagram).unwrap();
        reopen(&rendered, &rendered.bytes).unwrap();
        let svg = String::from_utf8(rendered.bytes).unwrap();
        assert!(!svg.contains("<script>"));
        assert!(!svg.contains("<foreignObject>"));
        assert!(!svg.contains(" onload=\""));
        assert!(!svg.contains(" style=\""));
        assert!(svg.contains("&lt;script&gt;"));
    }

    #[test]
    fn unreadable_label_and_unbounded_viewbox_fail_with_layout_overflow() {
        let mut long_label = representative();
        long_label.nodes[0].label = "界".repeat(MAX_LABEL_SCALARS);
        assert_eq!(render(&long_label), Err(AgentError::DiagramLayoutOverflow));

        let mut chain = DiagramArtifactV1 {
            title: None,
            description: None,
            layout: DiagramLayoutIntentV1 {
                strategy: DiagramLayoutStrategy::LayeredAuto,
                direction: DiagramLayoutDirection::LeftToRight,
            },
            nodes: (0..MAX_NODES)
                .map(|index| node(&format!("n{index}"), &format!("node {index}")))
                .collect(),
            edges: (0..MAX_NODES - 1)
                .map(|index| {
                    edge(
                        &format!("e{index}"),
                        &format!("n{index}"),
                        &format!("n{}", index + 1),
                    )
                })
                .collect(),
            groups: vec![],
        };
        canonicalize(&mut chain).unwrap();
        assert_eq!(render(&chain), Err(AgentError::DiagramLayoutOverflow));
    }

    #[test]
    fn structural_validator_rejects_active_or_unknown_svg_vocabulary() {
        let rendered = render(&representative()).unwrap();
        let mut script = rendered.bytes.clone();
        let close = script.len() - "</svg>\n".len();
        script.splice(close..close, b"<script>bad</script>\n".iter().copied());
        assert_eq!(reopen(&rendered, &script), Err(AgentError::IoFailed));

        let with_href = String::from_utf8(rendered.bytes.clone()).unwrap().replace(
            "<rect x=\"0\"",
            "<rect href=\"https://example.com\" x=\"0\"",
        );
        assert_eq!(
            reopen(&rendered, with_href.as_bytes()),
            Err(AgentError::IoFailed)
        );

        let without_namespace = String::from_utf8(rendered.bytes.clone())
            .unwrap()
            .replace(" xmlns=\"http://www.w3.org/2000/svg\"", "");
        assert_eq!(
            reopen(&rendered, without_namespace.as_bytes()),
            Err(AgentError::IoFailed)
        );
    }
}
