from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser(description="Compose bounded Production UI screencast frames into a review GIF.")
    parser.add_argument("frames", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--max-frames", type=int, default=120)
    parser.add_argument("--max-width", type=int, default=1000)
    args = parser.parse_args()

    paths = sorted(args.frames.glob("*.jpg"))
    if not paths:
        raise SystemExit("No screencast frames were captured")
    stride = max(1, (len(paths) + args.max_frames - 1) // args.max_frames)
    selected = paths[::stride]
    frames: list[Image.Image] = []
    for path in selected:
        with Image.open(path) as source:
            frame = source.convert("RGB")
            if frame.width > args.max_width:
                height = round(frame.height * args.max_width / frame.width)
                frame = frame.resize((args.max_width, height), Image.Resampling.LANCZOS)
            frames.append(frame)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        args.output,
        save_all=True,
        append_images=frames[1:],
        duration=110,
        loop=0,
        optimize=False,
    )


if __name__ == "__main__":
    main()
