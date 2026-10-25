"""復号済みのニャー３方向を、羊と同じ設定で無料実行環境上で立体化する。

公開する標準出力は段数・経過秒・メモリだけ。入力と詳しい記録は指定出力先に保持する。
暗号化・復号・取得は別工程。この台本は固定済みローカルファイルだけを読む。
"""

import argparse
import contextlib
import datetime
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import time
import traceback


WEIGHT_SHA256 = "d36f5881bcdc56726b73e517cd444c13c60732431622da7268145355c8d38e9c"
CONFIG_SHA256 = "315fd5bf601d1d103130b9fda202f1bd28eda495e68ed1621bc823d5519c5e5b"
WEIGHT_SIZE = 4_928_151_562
REQUIRED_FREE = 12_000_000_000
VIEWS = {
    "正面": "front",
    "左側面": "left",
    "背面": "back",
}
SETTINGS = {"スレッド": 4, "計算型": "float32", "装置": "cpu", "保存重み": "fp16",
            "段数": 30, "空間分割": 256, "分割処理数": 8000, "乱数": 12345}


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def write_json(path, value):
    temporary = path.with_name(path.name + ".writing")
    with temporary.open("w", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)


def sha256(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for data in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(data)
    return result.hexdigest()


def available_memory():
    fields = {}
    for line in Path("/proc/meminfo").read_text().splitlines():
        key, value = line.split(":", 1)
        fields[key] = int(value.split()[0]) * 1024
    available = fields["MemAvailable"]
    for limit_path, used_path in (
        ("/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory.current"),
        ("/sys/fs/cgroup/memory/memory.limit_in_bytes", "/sys/fs/cgroup/memory/memory.usage_in_bytes"),
    ):
        if Path(limit_path).is_file() and Path(used_path).is_file():
            raw = Path(limit_path).read_text().strip()
            if raw != "max":
                available = min(available, max(0, int(raw) - int(Path(used_path).read_text())))
    return available


def memory_usage():
    import resource
    fields = Path("/proc/self/statm").read_text().split()
    return {"使用バイト": int(fields[1]) * os.sysconf("SC_PAGE_SIZE"),
            "最大使用バイト": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024}


def update(output, **changes):
    target = output / "status.json"
    state = json.loads(target.read_text(encoding="utf-8")) if target.exists() else {}
    state.update(changes)
    state["更新時刻"] = now()
    write_json(target, state)


def validate(args, *, check_resources=True):
    if sys.platform != "linux":
        raise RuntimeError("この台本は別環境のリナックス専用です。")
    if not (args.code_dir / "hy3dgen/shapegen/pipelines.py").is_file():
        raise ValueError("固定コードがありません。")
    for package, wanted in {"diffusers": "0.32.2", "transformers": "4.49.0"}.items():
        if importlib.metadata.version(package) != wanted:
            raise ValueError("羊の依存部品の版と一致しません。")
    manifest = json.loads((args.workdir / "inputs.json").read_text(encoding="utf-8-sig"))
    entries = manifest.get("画像")
    if not isinstance(entries, list) or len(entries) != 3:
        raise ValueError("入力目録は３方向である必要があります。")
    paths = {}
    for direction, key in VIEWS.items():
        matches = [item for item in entries if item.get("方向") == direction]
        if len(matches) != 1:
            raise ValueError("方向が未確定または重複しています。")
        item = matches[0]
        if not str(item.get("原本識別子", "")).startswith("libfile_") or item.get("正面との整合確認") is not True:
            raise ValueError("指定原画との対応または整合確認が不一致です。")
        if item.get("承認") not in ("採用済み", "承認済み") and item.get("入力採用") != "初回形状検証用":
            raise ValueError("今回の入力として採用されていません。")
        path = args.workdir / "inputs" / (key + ".png")
        stated = Path(item["ファイル"])
        if stated.is_absolute() or (args.workdir / stated).resolve() != path.resolve():
            raise ValueError("入力先が固定した相対パスと一致しません。")
        expected = item.get("sha256")
        if not isinstance(expected, str) or sha256(path) != expected.lower():
            raise ValueError("派生入力の照合値が一致しません。")
        with path.open("rb") as stream:
            header = stream.read(26)
        if len(header) != 26 or header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR" or header[25] != 6:
            raise ValueError("入力は背景処理済みの色と透明度を持つ画像に限ります。")
        if not all(struct.unpack(">II", header[16:24])):
            raise ValueError("画像寸法が不正です。")
        paths[key] = path
    model = args.models_dir / "hunyuan3d-dit-v2-mv"
    weights, config = model / "model.fp16.safetensors", model / "config.yaml"
    if not weights.is_file() or weights.stat().st_size != WEIGHT_SIZE:
        raise ValueError("通常版重みの容量が一致しません。")
    if sha256(config) != CONFIG_SHA256:
        raise ValueError("固定設定の照合値が一致しません。")
    if check_resources and available_memory() < REQUIRED_FREE:
        raise RuntimeError("推論前の空きメモリが１２ギガバイト未満です。")
    return manifest, paths, weights, config


def block_network(event, args):
    if event in ("socket.connect", "socket.getaddrinfo"):
        raise RuntimeError("推論工程で外部接続は行いません。")


@contextlib.contextmanager
def private_logs(output):
    """部品や外部計算ライブラリーの出力も公開ログへ出さない。"""
    sys.stdout.flush()
    sys.stderr.flush()
    original_out, original_err = os.dup(1), os.dup(2)
    progress = os.fdopen(os.dup(1), "w", encoding="utf-8", buffering=1)
    try:
        with (output / "internal.log").open("a", encoding="utf-8", buffering=1) as log:
            os.dup2(log.fileno(), 1)
            os.dup2(log.fileno(), 2)
            try:
                yield progress
            except BaseException:
                traceback.print_exc(file=log)
                raise
            finally:
                sys.stdout.flush()
                sys.stderr.flush()
    finally:
        os.dup2(original_out, 1)
        os.dup2(original_err, 2)
        os.close(original_out)
        os.close(original_err)
        progress.close()


def generation_worker(args):
    with private_logs(args.output_dir) as progress:
        started = time.monotonic()
        manifest, paths, weights, config = validate(args)
        if sha256(weights) != WEIGHT_SHA256:
            raise ValueError("通常版重みの全体照合値が一致しません。")
        if available_memory() < REQUIRED_FREE:
            raise RuntimeError("重み照合後に空きメモリが不足しました。")
        update(args.output_dir, 状態="実行中", 推論="未開始", 工程="重みの読込", 設定=SETTINGS)
        write_json(args.output_dir / "input-record.json", manifest)
        import torch
        from PIL import Image
        import numpy as np
        from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
        torch.set_num_threads(4)
        images = {}
        for key, path in paths.items():
            with Image.open(path) as image:
                if image.mode != "RGBA":
                    raise ValueError("透明度のある派生入力ではありません。")
                images[key] = image.copy()
        pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_single_file(
            str(weights), str(config), use_safetensors=True, device="cpu", dtype=torch.float32)
        update(args.output_dir, 推論="実行中", 工程="形の推論", 完了段数=0, メモリ=memory_usage())

        def on_step(step, timestep, outputs):
            info = {"段数": int(step) + 1, "秒": round(time.monotonic() - started, 1), "メモリ": memory_usage()}
            progress.write(json.dumps(info, ensure_ascii=False) + "\n")
            update(args.output_dir, 完了段数=info["段数"], 経過秒=info["秒"], メモリ=info["メモリ"])
            if info["段数"] == 30:
                update(args.output_dir, 工程="立体への変換")

        mesh = pipeline(image=images, num_inference_steps=30, octree_resolution=256,
                        num_chunks=8000, generator=torch.manual_seed(12345), output_type="trimesh",
                        callback=on_step, callback_steps=1, enable_pbar=False)[0]
        if mesh is None or not len(mesh.vertices) or not len(mesh.faces):
            raise ValueError("有効な初回形状が生成されませんでした。")
        # 次の処理へ数値をそのまま渡し、重みのあるこのプロセスを終了させる。
        temporary = args.output_dir / "raw_mesh.writing.npz"
        np.savez(temporary, vertices=np.asarray(mesh.vertices), faces=np.asarray(mesh.faces))
        temporary.replace(args.output_dir / "raw_mesh.npz")
        update(args.output_dir, 推論="完成", 工程="重みの解放待ち", メモリ=memory_usage(),
               推論経過秒=round(time.monotonic() - started, 1))


def finishing_worker(args):
    with private_logs(args.output_dir):
        update(args.output_dir, 状態="実行中", 工程="形の整理と保存")
        import torch
        torch.set_num_threads(4)
        import numpy as np
        import trimesh
        from hy3dgen.shapegen import FloaterRemover, DegenerateFaceRemover
        with np.load(args.output_dir / "raw_mesh.npz", allow_pickle=False) as arrays:
            mesh = trimesh.Trimesh(vertices=arrays["vertices"], faces=arrays["faces"], process=False)
        mesh = FloaterRemover()(mesh)
        mesh = DegenerateFaceRemover()(mesh)
        temporary = args.output_dir / "nya_mv.partial.glb"
        mesh.export(str(temporary), file_type="glb")
        if not temporary.is_file() or not temporary.stat().st_size:
            raise ValueError("模型の保存を確認できませんでした。")
        temporary.replace(args.output_dir / "nya_mv.glb")
        update(args.output_dir, 状態="完成", 推論="完成", 工程="初回形状の出力完了", 完成時刻=now(),
               模型="nya_mv.glb", 頂点数=len(mesh.vertices), 面数=len(mesh.faces), メモリ=memory_usage(),
               原画との比較="未実施", 原画の承認変更="なし")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("workdir", "models-dir", "code-dir", "output-dir"):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--worker", choices=("generate", "finish"), help=argparse.SUPPRESS)
    args = parser.parse_args()
    for name in ("workdir", "models_dir", "code_dir", "output_dir"):
        setattr(args, name, getattr(args, name).resolve())
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for name in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
        os.environ[name] = "4"
    for name in ("HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE", "HF_DATASETS_OFFLINE"):
        os.environ[name] = "1"
    sys.path.insert(0, str(args.code_dir))
    sys.addaudithook(block_network)
    if args.worker:
        try:
            (generation_worker if args.worker == "generate" else finishing_worker)(args)
            return 0
        except BaseException as error:
            update(args.output_dir, 状態="中断", 工程="停止", 停止理由=str(error), 終了時刻=now())
            return 130 if isinstance(error, KeyboardInterrupt) else 2
    if sys.platform != "linux":
        update(args.output_dir, 状態="未開始", 推論="未開始", 停止理由="実行対象の環境ではありません。")
        return 2
    import fcntl
    with (args.output_dir / "run.lock").open("a") as lock:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 3
        if (args.output_dir / "nya_mv.glb").exists() or (args.output_dir / "status.json").exists():
            # 続行判断を自動でせず、既存の生成記録と出力を保持する。
            return 3
        update(args.output_dir, 状態="未開始", 推論="未開始", 工程="実行前の点検", 設定=SETTINGS)
        try:
            validate(args)
            common = [sys.executable, str(Path(__file__).resolve()), "--workdir", str(args.workdir),
                      "--models-dir", str(args.models_dir), "--code-dir", str(args.code_dir),
                      "--output-dir", str(args.output_dir)]
            for stage in ("generate", "finish"):
                result = subprocess.run(common + ["--worker", stage], check=False)
                if result.returncode:
                    update(args.output_dir, 状態="中断", 工程="停止", 終了値=result.returncode)
                    return result.returncode if result.returncode > 0 else 2
            return 0
        except BaseException as error:
            with (args.output_dir / "internal.log").open("a", encoding="utf-8") as log:
                traceback.print_exc(file=log)
            update(args.output_dir, 状態="中断", 工程="停止", 停止理由=str(error), 終了時刻=now())
            return 130 if isinstance(error, KeyboardInterrupt) else 2


if __name__ == "__main__":
    raise SystemExit(main())
