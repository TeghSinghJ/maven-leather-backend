const http = require('http');
const url='http://localhost:5000/api/dashboard/stocks-by-location?location=OVERALL';
http.get(url,(res)=>{console.log('status', res.statusCode); let d=''; res.on('data', c=>d+=c); res.on('end', ()=>console.log('body', d));}).on('error', e=>console.error('err', e.message));
