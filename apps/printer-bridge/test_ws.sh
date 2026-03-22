#!/bin/bash
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGVzdA==" \
  "https://zkgkyvvdeotqzxdgushn.supabase.co/realtime/v1/websocket?apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprZ2t5dnZkZW90cXp4ZGd1c2huIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0OTg3NzgsImV4cCI6MjA4ODA3NDc3OH0.bSskWi9dr2wyotqi_z9gv_-HP1A-WM_Jk5bZTJn92qo&vsn=1.0.0"
