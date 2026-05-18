import contextlib
import hashlib
import json
import os
import shutil
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 3:
        write_json({"ok": False, "error": "Usage: paddle_ocr.py <workspace_root> <image_path>"})
        return 2

    workspace_root = Path(sys.argv[1]).resolve()
    source_path = Path(sys.argv[2]).resolve()

    if not source_path.is_file():
        write_json({"ok": False, "error": f"Image file does not exist: {source_path}"})
        return 1

    cache_root = workspace_root / ".tmp" / "paddlex-cache"
    ascii_input_root = workspace_root / ".tmp" / "ocr-inputs"
    cache_root.mkdir(parents=True, exist_ok=True)
    ascii_input_root.mkdir(parents=True, exist_ok=True)

    os.environ.setdefault("PADDLE_PDX_CACHE_HOME", str(cache_root))
    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
    os.environ.setdefault("PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT", "False")
    os.environ.setdefault("FLAGS_use_mkldnn", "0")

    try:
        ascii_image_path = copy_to_ascii_path(source_path, ascii_input_root)

        with redirect_stdout_to_stderr():
            from paddleocr import PaddleOCR

            ocr = PaddleOCR(
                lang="ch",
                ocr_version="PP-OCRv4",
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
            )
            results = ocr.predict(str(ascii_image_path))

        texts = []
        scores = []
        for result in results:
            payload = getattr(result, "json", None)
            res = payload.get("res", {}) if isinstance(payload, dict) else {}
            texts.extend(res.get("rec_texts", []))
            scores.extend(res.get("rec_scores", []))

        normalized_texts = [str(text).strip() for text in texts if str(text).strip()]
        numeric_scores = [float(score) for score in scores if isinstance(score, (int, float))]
        confidence = sum(numeric_scores) / len(numeric_scores) if numeric_scores else None

        write_json({
            "ok": True,
            "text": "\n".join(normalized_texts),
            "lineCount": len(normalized_texts),
            "confidence": confidence,
        })
        return 0
    except Exception as error:
        write_json({"ok": False, "error": str(error)})
        return 1


def copy_to_ascii_path(source_path: Path, target_root: Path) -> Path:
    stat = source_path.stat()
    digest_input = f"{source_path}|{stat.st_mtime_ns}|{stat.st_size}".encode("utf-8")
    digest = hashlib.sha256(digest_input).hexdigest()[:32]
    suffix = source_path.suffix.lower() or ".img"
    target_path = target_root / f"{digest}{suffix}"
    if not target_path.exists() or target_path.stat().st_size != stat.st_size:
        shutil.copy2(source_path, target_path)
    return target_path


@contextlib.contextmanager
def redirect_stdout_to_stderr():
    original_stdout = sys.stdout
    sys.stdout = sys.stderr
    try:
        yield
    finally:
        sys.stdout = original_stdout


def write_json(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()


if __name__ == "__main__":
    raise SystemExit(main())
