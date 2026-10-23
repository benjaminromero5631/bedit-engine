#!/usr/bin/env python3
"""Read 540x960 RGB frames; emit a temporally stable grayscale person mask."""
import sys
import numpy as np
import mediapipe as mp

W, H = 540, 960
FRAME = W * H * 3
segmenter = mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=1)
while True:
    raw = sys.stdin.buffer.read(FRAME)
    if len(raw) != FRAME:
        break
    image = np.frombuffer(raw, dtype=np.uint8).reshape((H, W, 3))
    result = segmenter.process(image)
    # Softer edge avoids a cardboard outline while retaining hair and shoulders.
    mask = np.clip((result.segmentation_mask - 0.12) / 0.70, 0, 1)
    mask = (mask * 255).astype(np.uint8)
    sys.stdout.buffer.write(mask.tobytes())
    sys.stdout.buffer.flush()
segmenter.close()
