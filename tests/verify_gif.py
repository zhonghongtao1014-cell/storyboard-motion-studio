"""Independent Pillow decode of the GIF downloaded by the browser test."""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageChops

root = Path(__file__).resolve().parents[1]
path = root / 'test-results' / 'subject-sweep.gif'
image = Image.open(path)
assert image.size == (480, 270)
assert image.n_frames == 24
assert image.info.get('loop') == 0
frames, durations = [], []
for index in range(image.n_frames):
    image.seek(index)
    frames.append(image.convert('RGB').copy())
    durations.append(image.info['duration'])
assert sum(durations) == 2000
unique = len({hashlib.sha256(f.tobytes()).hexdigest() for f in frames})
assert unique >= 12, f'Only {unique} distinct frames'
baseline = frames[0]
outside_changes = 0
# Demo mask is x=.40, y=.22, w=.27, h=.55. Leave a pixel for edge antialiasing.
outside = [(0, 0, 480, 58), (0, 209, 480, 270), (0, 58, 191, 209), (323, 58, 480, 209)]
for frame in frames:
    for box in outside:
        if ImageChops.difference(baseline.crop(box), frame.crop(box)).getbbox():
            outside_changes += 1
assert outside_changes == 0
report = {'file': path.name, 'decoder': 'Pillow', 'size': image.size, 'frames': image.n_frames,
          'unique_frames': unique, 'duration_ms': sum(durations), 'loop': image.info['loop'],
          'outside_mask_changes': outside_changes, 'frame_delays_ms': durations}
(root / 'test-results' / 'gif-results.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report))
