import math
import tempfile
import wave
from pathlib import Path

import av
import numpy as np
from faster_whisper.audio import decode_audio
from faster_whisper.transcribe import Word


def main():
    with tempfile.TemporaryDirectory(prefix="bedit-transcriber-") as folder:
        source = Path(folder) / "tone.wav"
        rate = 16000
        samples = np.array([
            round(8000 * math.sin(2 * math.pi * 440 * i / rate))
            for i in range(rate)
        ], dtype="<i2")
        with wave.open(str(source), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(rate)
            wav.writeframes(samples.tobytes())
        decoded = decode_audio(str(source), sampling_rate=rate)
        if len(decoded) < rate * 0.95:
            raise AssertionError(f"Audio incompleto: {len(decoded)} muestras")
        if "probability" not in Word.__dataclass_fields__:
            raise AssertionError("faster-whisper no expone confianza por palabra")
        print(f"faster-whisper decoder OK; PyAV {av.__version__}; {len(decoded)} muestras")


if __name__ == "__main__":
    main()
