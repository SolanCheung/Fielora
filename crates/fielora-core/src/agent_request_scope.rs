//! Bounded local access-confirmation flow, not a general intent classifier.
use fielora_contracts::*;
use std::path::{Path, PathBuf};

pub const DENIED: &str = "AGENT_CURRENT_REQUEST_SCOPE_DENIED";

pub fn requested_paths(task: &str, target: &Path) -> Vec<PathBuf> {
    let pattern = regex::Regex::new(
        r#""([^"]+)"|'([^']+)'|`([^`]+)`|([A-Za-z]:[\\/][^\s，,；;。？?]+|/[^\s，,；;。？?]+)"#,
    )
    .unwrap();
    let paths: Vec<_> = pattern
        .captures_iter(task)
        .filter_map(|c| {
            let value = c.iter().skip(1).flatten().next()?;
            let path = PathBuf::from(value.as_str());
            path.is_absolute().then_some(path)
        })
        .collect();
    if paths.is_empty() {
        vec![target.to_owned()]
    } else {
        paths
    }
}

/// Recognize standalone access questions. Never invert the action heuristic.
pub fn access_question(task: &str) -> bool {
    let paths = regex::Regex::new(
        r#"`[^`]*`|"[^"]*"|'[^']*'|[A-Za-z]:[\\/][^\s，,；;。？?]+|/[^\s，,；;。？?]+"#,
    )
    .unwrap();
    let text = paths.replace_all(task, " ").to_lowercase();
    if [
        "继续", "修改", "修复", "实现", "调整", "替换", "删除", "新增", "创建", "提交", "推送",
        "运行", "执行", "比较", "对比", "解释", "分析", "总结", "然后", "并且", "顺便", "导出",
        "部署", "安装", "重构",
    ]
    .iter()
    .any(|word| text.contains(word))
    {
        return false;
    }
    let english = regex::Regex::new(r"\b(fix|change|update|edit|implement|continue|then|and|explain|compare|summarize|run|execute|create|delete|commit|push|deploy|install|refactor)\b").unwrap();
    if english.is_match(&text) {
        return false;
    }
    let question = regex::Regex::new(r"(?:你|现在|目前|请问|是否|能否|能不能|可以|能|还|已经|\s)*(?:看到|看见|读取|读到|访问|打开)(?:里面的|这个|该|这些|它的|的|项目|文件夹|目录|文件|代码|源码|内容|吗|么|呢|了|是否|可以|能|\s)*[？?。.!！]*$").unwrap();
    let english_question = regex::Regex::new(r"(?:can|could|are)\s+you\s+(?:now\s+)?(?:able\s+to\s+)?(?:read|see|access|open)\s+(?:(?:the|this|that|project|folder|directory|files|file|contents|content|code|source|it|here|now)\s*)*[?.!]*$").unwrap();
    let recognized = question
        .find(&text)
        .or_else(|| english_question.find(&text));
    let Some(recognized) = recognized else {
        return false;
    };
    // Do not discard an unrecognized leading instruction just because the last
    // clause is a question. Only resource-introduction clauses may precede it.
    let introduction = regex::Regex::new(r"^(?:\s|[，,。:：；;]|我(?:现在)?给你这个(?:地址|路径)|这是[^，,。:：；;]{1,80}(?:地址|路径)|(?:here|this)\s+is\s+(?:the\s+)?(?:project\s+)?(?:path|folder))*$").unwrap();
    if !introduction.is_match(&text[..recognized.start()]) {
        return false;
    }
    (question.is_match(&text)
        && ["能", "可以", "是否", "吗", "么"]
            .iter()
            .any(|s| text.contains(s)))
        || english_question.is_match(&text)
}

pub fn allows(name: &str, effect: AgentToolEffect) -> bool {
    effect == AgentToolEffect::Observe
        && matches!(
            name,
            "list_files" | "read_file" | "stat_path" | "search_text"
        )
}

/// Evidence must identify the supplied source, not an unrelated target file.
pub fn accessed_paths(
    roots: &[PathBuf],
    target: &Path,
    tools: &[AgentToolCallView],
) -> Vec<String> {
    roots
        .iter()
        .filter(|root| {
            tools.iter().any(|tool| {
                if tool.status != AgentToolStatus::Completed
                    || !matches!(tool.name.as_str(), "read_file" | "list_files")
                {
                    return false;
                }
                let Some(receipt) = tool.receipt.as_ref() else {
                    return false;
                };
                if !matches!(
                    receipt["kind"].as_str(),
                    Some("FILE_READ" | "JSON_READ" | "FILE_LIST")
                ) {
                    return false;
                }
                let Some(raw) = tool.arguments["path"].as_str() else {
                    return false;
                };
                let path = PathBuf::from(raw);
                let path = if path.is_absolute() {
                    path
                } else {
                    target.join(path)
                };
                let Ok(path) = path.canonicalize() else {
                    return false;
                };
                let Ok(root) = root.canonicalize() else {
                    return false;
                };
                path == root || (root.is_dir() && path.starts_with(root))
            })
        })
        .map(|p| fielora_agent::reference::display_path(p))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn access_questions_are_not_all_questions_or_absence_of_action_words() {
        for text in [
            r"F:\项目\猎头\headhunt-web 我现在给你这个地址，这是猎头项目的地址 你能看到里面的项目内容吗",
            "你能读取这个项目的代码吗？",
            "能否访问这个文件夹？",
            "Can you read the project files?",
            "Can you access this folder?",
            r"Can you access `F:\projects\sample`?",
            r"F:\projects\fix\update 你能看到里面的代码吗",
        ] {
            assert!(access_question(text), "{text}");
        }
        for text in [
            "能帮我修改这个文件吗？",
            "能看到项目吗？可以的话继续修改",
            "先修改文件，然后你能看到项目吗？",
            "读取代码并解释结构",
            "为什么没改成功",
            "继续",
            "把按钮变成蓝色",
            "Can you read it and fix the bug?",
            "Can you explain how to access this folder?",
            "把按钮变蓝。你能看到项目内容吗？",
        ] {
            assert!(!access_question(text), "{text}");
        }
    }

    #[test]
    fn only_builtin_file_observation_is_admitted() {
        assert!(allows("read_file", AgentToolEffect::Observe));
        for (name, effect) in [
            ("replace_text", AgentToolEffect::WorkspaceWrite),
            ("run_command", AgentToolEffect::Process),
            ("git_commit", AgentToolEffect::WorkspaceWrite),
            ("delegate_readonly", AgentToolEffect::Observe),
            ("provider.lookup", AgentToolEffect::Observe),
            ("browser", AgentToolEffect::Observe),
        ] {
            assert!(!allows(name, effect));
        }
    }

    #[test]
    fn missing_requested_sources_never_fall_back_to_target() {
        let target = std::env::temp_dir();
        let missing = target.join("fielora-nonexistent-reference-source");
        assert_eq!(
            requested_paths(
                &format!("Can you access this folder? `{}`", missing.display()),
                &target
            ),
            vec![missing]
        );
        assert!(accessed_paths(std::slice::from_ref(&target), &target, &[]).is_empty());
    }
}
