import http from 'http';

http.get('http://localhost:5000/api/tasks/users/dev', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => console.log('Response:', data));
}).on('error', (err) => console.error(err));
