const { createClient } = require('@supabase/supabase-js');

var url = 'https://zkgkyvvdeotqzxdgushn.supabase.co';
var key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprZ2t5dnZkZW90cXp4ZGd1c2huIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0OTg3NzgsImV4cCI6MjA4ODA3NDc3OH0.bSskWi9dr2wyotqi_z9gv_-HP1A-WM_Jk5bZTJn92qo';

var sb = createClient(url, key);

sb.channel('test')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'print_queue' }, function(p) {
    console.log('GOT:', p);
  })
  .subscribe(function(s, e) {
    console.log('STATUS:', s, e);
    if (s === 'SUBSCRIBED') {
      console.log('SUCCESS');
      setTimeout(function() { process.exit(0); }, 2000);
    }
    if (s === 'TIMED_OUT') {
      console.log('FAILED');
      process.exit(1);
    }
  });

setTimeout(function() { console.log('GLOBAL TIMEOUT'); process.exit(1); }, 30000);
