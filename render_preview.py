"""生成模型を変更せず、クラウド上で塗装前の形を四方向から確認する。

描画は推論が終わってメモリを解放した後、別プロセスで実行する。
模型の向きは原画との照合前なので、画像には仮の方向番号を付ける。
三角形の間引き、模型の書き出し、塗装、推論は行わない。

実行例（クラウドの実行定義から呼ぶ）:
  xvfb-run -a blender --background --factory-startup --threads 4 \
    --python-exit-code 2 --python cloud-run/render_preview.py -- \
    --model output/nya_shape.glb --output-dir output/preview
  python cloud-run/render_preview.py --compose-only --output-dir output/preview

描画には blender、xvfb、Mesa のソフトウェア描画が必要。
一覧作成には Pillow と日本語フォントが必要。
"""

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import time


VIEWS = (
    ("方向一", (0.0, -1.0, 0.0)),
    ("方向二", (1.0, 0.0, 0.0)),
    ("方向三", (0.0, 1.0, 0.0)),
    ("方向四", (-1.0, 0.0, 0.0)),
)


def arguments():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, default=Path("output/nya_shape.glb"))
    parser.add_argument("--output-dir", type=Path, default=Path("output/preview"))
    parser.add_argument("--compose-only", action="store_true")
    parser.add_argument("--font", type=Path)
    return parser.parse_args(argv)


def save_record(path, value):
    temporary = path.with_suffix(".writing.json")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def model_hash(path):
    checksum = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            checksum.update(block)
    return checksum.hexdigest()


def render(args):
    if os.environ.get("GITHUB_ACTIONS") != "true":
        raise RuntimeError("この描画台本はクラウドの実行定義専用です。手元では起動しません。")
    # 表示・計算用の環境変数は起動前に実行定義でも設定する。
    os.environ.setdefault("LIBGL_ALWAYS_SOFTWARE", "1")
    os.environ.setdefault("LP_NUM_THREADS", "4")
    import bpy
    from mathutils import Vector

    source = args.model.resolve()
    destination = args.output_dir.resolve()
    if not source.is_file() or source.suffix.lower() != ".glb":
        raise ValueError("生成済みの模型ファイルがありません。")
    if source.stat().st_size == 0:
        raise ValueError("模型ファイルが空です。")
    source_hash = model_hash(source)
    destination.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    bpy.context.view_layer.update()
    scene = bpy.context.scene
    meshes = [obj for obj in scene.objects if obj.type == "MESH"]
    if not meshes or not any(len(obj.data.polygons) for obj in meshes):
        raise ValueError("模型に描画できる面がありません。")
    # 読込後の座標変換は保ち、元模型の頂点・面は変更しない。
    bounds = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    low = Vector(tuple(min(point[axis] for point in bounds) for axis in range(3)))
    high = Vector(tuple(max(point[axis] for point in bounds) for axis in range(3)))
    span = high - low
    if not all(math.isfinite(value) for value in (*low, *high)) or min(span) <= 0:
        raise ValueError("模型の範囲を正常に確認できません。")
    center = (low + high) / 2
    scale = max(span) * 1.16
    for obj in meshes:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    # 模型に同梱されたカメラ等があっても、この確認では新しいカメラだけを使う。
    camera_data = bpy.data.cameras.new("確認用カメラ")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = scale
    camera_data.clip_start = max(max(span) * 0.001, 0.0001)
    camera_data.clip_end = max(span) * 20
    camera = bpy.data.objects.new("確認用カメラ", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 4
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.render.use_compositing = False
    scene.render.use_sequencer = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.studiolight_rotate_z = 0
    shading.color_type = "SINGLE"
    shading.single_color = (0.58, 0.58, 0.58)
    shading.background_type = "WORLD"
    shading.show_shadows = True
    shading.show_cavity = True
    shading.cavity_type = "BOTH"
    shading.show_object_outline = False
    world = bpy.data.worlds.new("確認用の白背景")
    world.color = (1.0, 1.0, 1.0)
    scene.world = world
    record = {
        "状態": "実行中", "用途": "塗装前の形の確認", "向き": "仮置き・原画との照合前",
        "模型": str(source), "模型照合値": source_hash,
        "描画方式": scene.render.engine, "描画ソフトの版": bpy.app.version_string,
        "画像寸法": [512, 512], "投影": "正射影", "並列数": 4,
        "頂点数": sum(len(obj.data.vertices) for obj in meshes),
        "面数": sum(len(obj.data.polygons) for obj in meshes),
        "面の間引き": "なし", "模型の再保存": "なし",
        "中心": list(center), "全体範囲": [list(low), list(high)],
        "共通の正射影範囲": scale, "画像": [],
        "軸の根拠": "羊の既存確認台本は負のＹ方向を正面候補とする。今回の生成模型は未照合。",
    }
    record_path = destination / "preview-record.json"
    save_record(record_path, record)
    for index, (label, direction) in enumerate(VIEWS, start=1):
        vector = Vector(direction)
        camera.location = center + vector * (span.length * 3)
        camera.rotation_euler = (-vector).to_track_quat("-Z", "Y").to_euler()
        target = destination / f"{index:02d}_塗装前_{label}.png"
        scene.render.filepath = str(target)
        bpy.ops.render.render(write_still=True)
        if not target.is_file() or target.stat().st_size == 0:
            raise RuntimeError(label + "の確認画像が保存されませんでした。")
        record["画像"].append({"表示": label, "カメラ方向": list(direction), "ファイル": target.name})
        save_record(record_path, record)
    if model_hash(source) != source_hash:
        raise RuntimeError("描画の間に模型ファイルが変わりました。確認画像は確定できません。")
    record.update({"状態": "描画完了", "経過秒": round(time.monotonic() - started, 2), "一覧": "未作成"})
    save_record(record_path, record)
    print("塗装前の四方向を保存しました。向きと形の承認は未実施です。", flush=True)


def compose(args):
    from PIL import Image, ImageDraw, ImageFont

    directory = args.output_dir.resolve()
    record_path = directory / "preview-record.json"
    record = json.loads(record_path.read_text(encoding="utf-8"))
    if record.get("状態") != "描画完了" or len(record.get("画像", [])) != 4:
        raise ValueError("四方向の描画完了を確認できません。")
    candidates = [args.font] if args.font else []
    candidates.extend([
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
        Path("/usr/share/fonts/truetype/noto/NotoSansJP-Regular.ttf"),
    ])
    font_path = next((path for path in candidates if path and path.is_file()), None)
    if font_path is None:
        raise ValueError("日本語の見出しに必要なフォントがありません。")
    title_font = ImageFont.truetype(str(font_path), 28)
    label_font = ImageFont.truetype(str(font_path), 22)
    canvas = Image.new("RGB", (1024, 1200), "white")
    draw = ImageDraw.Draw(canvas)
    draw.text((28, 16), "ニャー　塗装前の形", fill=(28, 28, 28), font=title_font)
    draw.text((28, 57), "向きは仮置き・原画との照合前", fill=(80, 80, 80), font=label_font)
    for index, item in enumerate(record["画像"]):
        x = (index % 2) * 512
        y = 104 + (index // 2) * 548
        draw.text((x + 24, y), item["表示"], fill=(35, 35, 35), font=label_font)
        with Image.open(directory / item["ファイル"]) as image:
            if image.size != (512, 512):
                raise ValueError("確認画像の寸法が予定と異なります。")
            canvas.paste(image.convert("RGB"), (x, y + 36))
    target = directory / "all.png"
    canvas.save(target)
    record["一覧"] = target.name
    save_record(record_path, record)
    print("塗装前と明示した四方向の一覧を保存しました。", flush=True)


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    options = arguments()
    if options.compose_only:
        compose(options)
    else:
        render(options)
