// '': for Option A set to your Render URL; for Option B (served from same origin) leave as ''
const '' = '';

function api(path){ return (''||'') + path; }

document.getElementById('btnEnter').onclick = () => {
  const code = document.getElementById('access').value.trim();
  if (code === 'GV2025@') { document.getElementById('login').classList.add('hidden'); document.getElementById('teacher').classList.remove('hidden'); loadLatest(); }
  else { document.getElementById('login').classList.add('hidden'); document.getElementById('student').classList.remove('hidden'); loadLatest(); }
};

document.getElementById('btnUpload').onclick = async () => {
  const pass = document.getElementById('teacherPass').value.trim();
  if (pass !== 'GV2025@') return alert('Sai mật khẩu giáo viên');
  const file = document.getElementById('examFile').files[0];
  if (!file) return alert('Chọn file');
  const fd = new FormData(); fd.append('file', file); fd.append('timeMinutes', document.getElementById('timeMinutes').value||''); fd.append('password', document.getElementById('examPassword').value||'');
  const res = await fetch(api('/exam/upload'), { method:'POST', body: fd }); const data = await res.json();
  if (data.ok){ document.getElementById('teacherMsg').innerText = 'Upload thành công: ' + data.count; loadLatest(); } else document.getElementById('teacherMsg').innerText = 'Lỗi: ' + (data.error||'');
};

async function loadLatest(){ try{ const res = await fetch(api('/exam/latest')); const data = await res.json(); const sel = document.getElementById('examSelect'); sel.innerHTML=''; if (data.ok && data.questions && data.questions.length>0){ const opt=document.createElement('option'); opt.value=data.examId; opt.textContent=`Đề mới (${data.questions.length} câu)`; sel.appendChild(opt); window.LATEST_QUESTIONS=data.questions; window.LATEST_EXAM_ID=data.examId; } else { const opt=document.createElement('option'); opt.textContent='Chưa có đề'; sel.appendChild(opt); window.LATEST_QUESTIONS=[]; window.LATEST_EXAM_ID=null; } }catch(e){ console.error(e); } }

document.getElementById('btnStart').onclick = ()=>{ const className=document.getElementById('className').value.trim(); const classPass=document.getElementById('classPass').value.trim(); const name=document.getElementById('stName').value.trim(); const dob=document.getElementById('stDOB').value; if(!className||!classPass||!name) return alert('Nhập đủ thông tin'); const classPasswords = {'12A1':'A12526','12A2':'A22526','12A3':'A32526','12A4':'A42526'}; if(classPasswords[className] !== classPass) return alert('Sai mật khẩu lớp'); startExam({name, className, dob}); };

let timerHandle, timeLeftSec=0, tabCount=0;
function startExam({name, className, dob}){
  const questions = window.LATEST_QUESTIONS||[]; if(questions.length===0) return alert('Chưa có đề');
  document.getElementById('questions').innerHTML=''; questions.forEach((q,i)=>{ const d=document.createElement('div'); d.innerHTML=`<b>Câu ${i+1}:</b><div>${q.replace(/\n/g,'<br>')}</div>`; document.getElementById('questions').appendChild(d); });
  timeLeftSec = (parseInt(document.getElementById('timeMinutes')?.value) || 45) * 60;
  document.getElementById('student').classList.add('hidden'); document.getElementById('examArea').classList.remove('hidden');
  document.getElementById('timer').innerText = formatTime(timeLeftSec);
  timerHandle = setInterval(()=>{ timeLeftSec--; document.getElementById('timer').innerText = formatTime(timeLeftSec); if(timeLeftSec<=0){ clearInterval(timerHandle); doSubmit({name, className, dob}); } },1000);
  tabCount=0; document.addEventListener('visibilitychange', ()=>{ if(document.hidden){ tabCount++; document.getElementById('tabWarn').innerText = `Bạn đã rời trang ${tabCount} lần`; if(tabCount>=3){ alert('Bạn đã vi phạm. Bài sẽ được thu.'); clearInterval(timerHandle); doSubmit({name, className, dob}); } } }); window.CURRENT_STUDENT={name, className, dob};
}

function formatTime(s){ if(s<0) s=0; const m=Math.floor(s/60); const sec=s%60; return `${m}:${String(sec).padStart(2,'0')}`; }

document.getElementById('btnSubmit').onclick = ()=>{ const answersText=document.getElementById('studentAnswers').value.trim(); let answersPar; try{ answersPar=JSON.parse(answersText);}catch(e){ answersPar=answersText;} doSubmit({...window.CURRENT_STUDENT, answers: answersPar}); };

async function doSubmit({name, className, dob, answers}){ const payload={name, className, dob, answers, score:null, examId: window.LATEST_EXAM_ID}; try{ const res = await fetch(api('/student/submit'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }); const data = await res.json(); document.getElementById('examArea').classList.add('hidden'); document.getElementById('resultArea').classList.remove('hidden'); document.getElementById('scoreShow').innerText = data.ok ? 'Bài đã nộp. File: ' + (data.file||'') : 'Lỗi khi nộp: ' + (data.error||''); }catch(e){ console.error(e); alert('Lỗi khi gửi bài: '+e.message);} }
