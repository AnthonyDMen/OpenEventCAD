# Local engine update and mirror

The local development checkout mirrors the engine `main` branch to GitHub
after a successful push to the primary `origin` remote. The hook only pushes
the engine commit; it does not copy credentials or downstream project files.

Install it once from the engine repository:

```sh
ln -sf "$PWD/scripts/post-push-floorplanner" .git/hooks/post-push
```

The default mirror remote is `github`; set `ENGINE_GITHUB_REMOTE` if it uses a
different remote name. Pushing another branch does not trigger the hook.

The downstream floorplanner deployment controls when it pulls the mirrored
engine. A successful engine mirror confirms the shared source is available;
verify the downstream deployment separately before treating an update as live.

## Test the current local build from a phone or tablet

The local container publishes the planner on port 8000 for both this computer
and other devices on the same local network. Use the computer's Wi-Fi or wired
LAN address in the device browser, for example:

```text
http://<computer-lan-ip>:8000
```

The phone or tablet must be on the same normal Wi-Fi network. Guest Wi-Fi,
cellular data, VPNs, and Wi-Fi client isolation can prevent devices from
reaching the computer even when the planner works at `localhost:8000`.

After an engine, template, CSS, or bundled-data change, rebuild the local web
service before device testing:

```sh
podman-compose up --build --force-recreate --no-deps -d web
```

This is local testing only. Browser floorplans remain local to each device, so
the phone does not automatically see layouts saved in the computer's browser.
