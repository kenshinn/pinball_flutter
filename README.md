Pinball Sandbox — MVP

Overview
- A lightweight WebGL physics sandbox (pinball-like) implemented with three.js + cannon-es as a standalone web app.
- A minimal Flutter web "shell" is included that embeds the three.js app inside an iframe for those who want a Flutter outer frame.
- Mobile: uses deviceorientation to tilt gravity (if permitted by browser). Desktop: mouse orbit controls; click/tap to spawn balls.

Contents
- three_app/ : standalone web app (index.html + js/)
- flutter_shell/ : minimal Flutter web app that embeds three_app/index.html via an IFrame (web-only)

Quick run (standalone three_app)
1. Start a simple static server from the project root (recommended; module imports often disallow file://):
   - Python 3: python3 -m http.server 8000
   - Node: npx http-server . -p 8000
2. Open http://localhost:8000/pinball_mvp/three_app/

What to expect
- 3D perspective camera by default
- Click (desktop) or tap (mobile) to spawn a ball
- On mobile, grant motion permissions when requested — tilting your device will change gravity direction
- Use mouse to orbit/zoom on desktop

Flutter shell (web)
- The Flutter shell embeds three_app/index.html in an iframe. To run:
  1. Install Flutter SDK and enable web: https://flutter.dev/docs/get-started/web
  2. cd flutter_shell
  3. flutter pub get
  4. flutter run -d chrome

Deploy to GitHub Pages (two options)
A) Deploy the standalone three_app (simplest)
   - Build a repo containing the contents of three_app/ at its root and push to gh-pages branch or use GitHub Pages from the main branch /docs folder.
   - Example: copy three_app/* to a docs/ folder, commit and push; enable GitHub Pages to serve /docs

B) Deploy Flutter web shell
   - Build Flutter web: flutter build web (in flutter_shell)
   - Merge the contents of build/web into the repository root or docs/ and push to GitHub Pages.

Notes & next steps
- This is an initial MVP: no flippers yet, but the physics sandbox is interactive and mobile-aware.
- I can add: flippers (+ controls), scoring, textures, sound effects, level presets, touch UI, or pack everything into a single-page Flutter app using HtmlElementView + asset copying.

If you want, I can:
- Add flippers and basic pinball bumpers
- Create a GitHub repo and push + enable Pages (you'll need to provide a GitHub token or perform the authenticated steps)
- Build a production web bundle and upload the zip again

"Ready" checklist before I upload/push anywhere
- Do you want me to add flippers next (Y/N)?
- If you want me to push to GitHub Pages, supply the repo URL and a Personal Access Token with repo permissions or tell me you will handle the push and I will give you the built files.

Enjoy! — Nova
