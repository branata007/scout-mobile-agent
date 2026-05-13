# Backend smoke test

End-to-end manual verification. Assumes the server is running on `localhost:3000` with `SCOUT_API_KEY=test-key-1234`.

## 1. Health

```bash
curl -s http://localhost:3000/health
# {"status":"ok"}
```

## 2. Create a project

```bash
curl -s -X POST http://localhost:3000/projects \
  -H "x-scout-api-key: test-key-1234" \
  -H "content-type: application/json" \
  -d '{"name":"smoke-app","default_personas":["happy-rusher"]}'
```

Save the returned `id` as `PROJECT_ID`.

## 3. Build a minimal trace bundle

```bash
cat > /tmp/trace.json <<'EOF'
{
  "version": 1,
  "recorded_at": "2026-05-12T10:00:00.000Z",
  "flow_name": "smoke",
  "actions": [{"type":"launch","timestamp_ms":0}],
  "states": [{"after_action_index":0,"screenshot_path":"s/0.png","ui_tree":{},"timestamp_ms":100}]
}
EOF

cat > /tmp/metadata.json <<EOF
{"project_id":"$PROJECT_ID","mode":"exploration","personas":["happy-rusher"],"intent":"smoke"}
EOF

# Create a stub APK
printf 'PK\x03\x04smoke' > /tmp/app.apk
```

## 4. Upload a run

```bash
curl -s -X POST http://localhost:3000/runs \
  -H "x-scout-api-key: test-key-1234" \
  -F "apk=@/tmp/app.apk;type=application/vnd.android.package-archive" \
  -F "trace=@/tmp/trace.json;type=application/json" \
  -F "metadata=@/tmp/metadata.json;type=application/json"
```

The response should contain `run.id`, `run.status: "queued"`, and `sessions[0].persona_id: "happy-rusher"`.

## 5. Fetch the run

```bash
curl -s http://localhost:3000/runs/<run-id> \
  -H "x-scout-api-key: test-key-1234"
```

## 6. Check the filesystem

```bash
ls ./storage/runs/<run-id>/
# Should contain app.apk and trace.json
```
