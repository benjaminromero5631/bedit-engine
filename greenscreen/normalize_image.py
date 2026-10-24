#!/usr/bin/env python3
"""Normalize common phone and web still-image formats to an upright JPEG."""
import sys
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

register_heif_opener()

source, destination = sys.argv[1:3]
with Image.open(source) as original:
    image = ImageOps.exif_transpose(original)
    if getattr(image, "is_animated", False):
        image.seek(0)
    image.load()
    if image.mode in ("RGBA", "LA") or "transparency" in image.info:
        rgba = image.convert("RGBA")
        canvas = Image.new("RGB", rgba.size, "white")
        canvas.paste(rgba, mask=rgba.getchannel("A"))
        image = canvas
    else:
        image = image.convert("RGB")
    image.save(destination, "JPEG", quality=94, optimize=True, progressive=True)
