# B Edit · Green Screen (independent engine)

Separate service and storage. It does not add routes, data, or processing steps to the production B Edit service.

## Input contract

`POST /jobs` (multipart, `Authorization: Bearer <GREEN_SCREEN_TOKEN>`):

- `video`: one camera recording (MP4/MOV/M4V/WebM/MKV, up to 2 GB, max 125 s).
- `image`: one or more vertical JPG/PNG/WebP background images (repeat the field).
- `name` (optional) and `callbackUrl` (optional).

The first six final seconds use a 2×2 collage made from the first four images (repeat images if fewer were supplied). The remaining images each fill the background for an equal share of the remaining duration. The camera foreground is segmented with MediaPipe Selfie Segmentation. The audio is transcribed in Spanish and the existing B Edit cut planner is reused at `fuerte` sensitivity; captions are not rendered. The default B Edit music track is selected from `MUSIC_DIR` when configured.

`GET /jobs/:id` returns status; `GET /jobs/:id/result` downloads the MP4; `GET /jobs/:id/plan` returns the transcript/cuts and review warnings. `GET /health` does not require a token.

## Deployment isolation

- Easypanel service: `greenscreen-engine`.
- Dockerfile path: `greenscreen/Dockerfile` from the repository root.
- `DATA_DIR=/data/green-screen`, with a distinct `greenscreen-data` volume mounted at `/data`.
- `GREEN_SCREEN_TOKEN` is a separate secret from `BEDIT_TOKEN`.
- For music sharing, prefer a read-only mount and restrict the code to the music directory. Do not mount the B Edit volume read-write.
- Do not point the B Edit service at this Dockerfile or storage volume.

## Draft caveat

Background removal quality depends on a clear, evenly lit neutral background and good separation between the subject and the wall. The automatic output should remain a draft until reviewed, especially around hair, hands, and dark clothing against a dark background.
