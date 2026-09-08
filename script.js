/* PROJECT FLUID V2
   Client-side only: all progress, planner, notes and flashcards use localStorage.
*/

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const storage = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch {}
  }
};


/* ============================================
   V4 CLOUD ACCOUNTS — SUPABASE
   Uses only the publishable browser key. Never put a secret/service-role key here.
   ============================================ */
const SUPABASE_URL = "https://uoyfnjmwjkyuzbgdjyet.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_IrNcxwzixEPQGlykrThsnQ_6ffqGYgU";
const supabaseClient = (window.supabase && typeof window.supabase.createClient === "function")
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

const accountButton = $("#accountButton");
const authModal = $("#authModal");
const accountModal = $("#accountModal");
const authForm = $("#authForm");
const authTitle = $("#authTitle");
const authSubtitle = $("#authSubtitle");
const authSubmit = $("#authSubmit");
const authModeToggle = $("#authModeToggle");
const forgotPassword = $("#forgotPassword");
const authNameRow = $("#authNameRow");
const authMessage = $("#authMessage");
const accountStatus = $("#accountStatus");
const storageBadge = $("#storageBadge");
let authMode = "signin";
let currentUser = null;

function setAuthMessage(message, error=false){ if(authMessage){ authMessage.textContent=message; authMessage.style.color=error?"var(--danger)":""; } }
function openModal(el){ if(el) el.hidden=false; }
function closeModal(el){ if(el) el.hidden=true; }
function setAuthMode(mode){
  authMode=mode;
  const signup=mode==="signup";
  if(authTitle) authTitle.textContent=signup?"Create your Project Fluid account":"Sign in to Project Fluid";
  if(authSubtitle) authSubtitle.textContent=signup?"Save your study life to the cloud and use it on any device.":"Sync your progress, planner, notes and quizzes across devices.";
  if(authSubmit) authSubmit.textContent=signup?"Create account":"Sign in";
  if(authModeToggle) authModeToggle.textContent=signup?"I already have an account":"Create an account instead";
  if(forgotPassword) forgotPassword.hidden=signup;
  if(authNameRow) authNameRow.hidden=!signup;
  setAuthMessage("");
}

async function ensureCloudProfile(user){
  if(!supabaseClient || !user) return null;
  const name = user.user_metadata?.display_name || user.user_metadata?.name || user.email?.split("@")[0] || "Student";
  const {data,error}=await supabaseClient.from("profiles").upsert({
    id:user.id, display_name:name, updated_at:new Date().toISOString()
  },{onConflict:"id"}).select().single();
  if(error){ console.error("Profile sync error",error); return null; }
  return data;
}

function applyCloudProfile(profile){
  if(!profile) return;
  if(window.projectFluidV3?.data){
    const d=window.projectFluidV3.data;
    d.xp=Number(profile.xp)||d.xp||0; d.level=Number(profile.level)||d.level||1;
    d.streak=Number(profile.streak)||d.streak||0; d.studyMinutes=Number(profile.total_study_minutes)||d.studyMinutes||0;
    d.isPremium=Boolean(profile.is_premium);
    window.projectFluidV3.save?.(); window.projectFluidV3.renderDashboard?.();
  }
  const plan=$("#accountPlan"), badge=$("#premiumBadge");
  const premium=Boolean(profile.is_premium);
  if(plan) plan.textContent=premium?"PREMIUM":"FREE";
  if(badge){badge.textContent=premium?"💎 PREMIUM":"FREE";badge.classList.toggle("premium",premium);}
}

async function syncLocalProfileToCloud(){
  if(!supabaseClient || !currentUser || !window.projectFluidV3?.data) return;
  const d=window.projectFluidV3.data;
  const {error}=await supabaseClient.from("profiles").upsert({
    id:currentUser.id, xp:Number(d.xp)||0, level:Number(d.level)||1, streak:Number(d.streak)||0,
    total_study_minutes:Number(d.studyMinutes)||0, updated_at:new Date().toISOString()
  },{onConflict:"id"});
  if(error) throw error;
  if($("#syncStatus")) $("#syncStatus").textContent="Cloud sync complete ✓";
  storageBadge?.classList.add("cloud-synced"); if(storageBadge) storageBadge.textContent="CLOUD SYNCED";
}

async function handleSignedIn(user){
  currentUser=user;
  const profile=await ensureCloudProfile(user);
  applyCloudProfile(profile);
  if(accountButton) accountButton.textContent="Account";
  if(accountStatus){accountStatus.hidden=false;accountStatus.textContent=user.email||"Signed in";}
  closeModal(authModal);
  if($("#accountNameDisplay")) $("#accountNameDisplay").textContent=profile?.display_name || user.user_metadata?.display_name || "Student";
  if($("#accountEmailDisplay")) $("#accountEmailDisplay").textContent=user.email||"";
  if($("#syncStatus")) $("#syncStatus").textContent="Your account is connected.";
  try{ await syncLocalProfileToCloud(); }catch(e){ console.error(e); }
}

async function initV4Auth(){
  if(!supabaseClient){ setAuthMessage("Account system could not load. Check your internet connection.",true); return; }
  const {data}=await supabaseClient.auth.getSession();
  if(data.session) await handleSignedIn(data.session.user);
  supabaseClient.auth.onAuthStateChange(async (_event,session)=>{
    if(session) await handleSignedIn(session.user);
    else {
      currentUser=null;
      if(accountButton) accountButton.textContent="Sign in";
      if(accountStatus) accountStatus.hidden=true;
      if(storageBadge){storageBadge.textContent="LOCAL";storageBadge.classList.remove("cloud-synced");}
    }
  });
}

accountButton?.addEventListener("click",()=> currentUser ? openModal(accountModal) : openModal(authModal));
$("[data-close-auth]")?.addEventListener("click",()=>closeModal(authModal));
$("[data-close-account]")?.addEventListener("click",()=>closeModal(accountModal));
authModeToggle?.addEventListener("click",()=>setAuthMode(authMode==="signin"?"signup":"signin"));

authForm?.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!supabaseClient){setAuthMessage("Account system is unavailable.",true);return;}
  authSubmit.disabled=true; setAuthMessage("Please wait…");
  const email=$("#authEmail")?.value.trim(); const password=$("#authPassword")?.value; const name=$("#authName")?.value.trim();
  try{
    if(authMode==="signup"){
      const {data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{display_name:name||email.split("@")[0]}}});
      if(error) throw error;
      if(data.session) await handleSignedIn(data.user);
      else setAuthMessage("Account created. Check your email to confirm your account, then sign in.");
    }else{
      const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
      if(error) throw error; await handleSignedIn(data.user);
    }
  }catch(err){ setAuthMessage(err.message||"Something went wrong.",true); }
  finally{authSubmit.disabled=false;}
});

forgotPassword?.addEventListener("click",async()=>{
  if(!supabaseClient) return; const email=$("#authEmail")?.value.trim();
  if(!email){setAuthMessage("Enter your email first.",true);return;}
  try{
    const redirect=window.location.origin+window.location.pathname;
    const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:redirect});
    if(error) throw error; setAuthMessage("Password reset email sent. Check your inbox.");
  }catch(err){setAuthMessage(err.message||"Could not send reset email.",true);}
});

$("#signOutButton")?.addEventListener("click",async()=>{
  if(!supabaseClient) return; await supabaseClient.auth.signOut(); closeModal(accountModal);
});
$("#syncNow")?.addEventListener("click",async()=>{
  try{await syncLocalProfileToCloud();}catch(err){if($("#syncStatus")) $("#syncStatus").textContent="Sync failed. Please try again.";}
});
setAuthMode("signin");

/* Theme */
const themeToggle = $("#themeToggle");
const savedTheme = localStorage.getItem("project-fluid-theme");
if (savedTheme === "light") {
  document.body.classList.add("light-mode");
  if (themeToggle) themeToggle.textContent = "☀";
}
themeToggle?.addEventListener("click", () => {
  document.body.classList.toggle("light-mode");
  const isLight = document.body.classList.contains("light-mode");
  localStorage.setItem("project-fluid-theme", isLight ? "light" : "dark");
  themeToggle.textContent = isLight ? "☀" : "☾";
});

/* Navbar shadow */
const navbar = $(".navbar");
window.addEventListener("scroll", () => {
  if (!navbar) return;
  navbar.style.boxShadow = window.scrollY > 40 ? "0 10px 40px rgba(0,0,0,.18)" : "none";
}, { passive: true });

/* GPA Calculator */
const courseList = $("#courseList");
const addCourseButton = $("#addCourse");
const calculateGPAButton = $("#calculateGPA");
const gpaResult = $("#gpaResult");

function createCourseRow() {
  const row = document.createElement("div");
  row.className = "course-row";
  row.innerHTML = `
    <input type="text" placeholder="Course name" class="course-name" aria-label="Course name">
    <input type="number" placeholder="Credits" min="0" step="0.5" class="course-credit" aria-label="Credit hours">
    <select class="course-grade" aria-label="Course grade">
      <option value="">Grade</option><option value="4">A</option><option value="3.7">A-</option>
      <option value="3.3">B+</option><option value="3">B</option><option value="2.7">B-</option>
      <option value="2.3">C+</option><option value="2">C</option><option value="1.7">C-</option>
      <option value="1.3">D+</option><option value="1">D</option><option value="0">F</option>
    </select>`;
  return row;
}
addCourseButton?.addEventListener("click", () => {
  const row = createCourseRow();
  courseList.appendChild(row);
  $(".course-name", row)?.focus();
});
calculateGPAButton?.addEventListener("click", () => {
  const rows = $$(".course-row", courseList);
  let totalQualityPoints = 0, totalCredits = 0, hasError = false;
  rows.forEach(row => {
    const creditInput = $(".course-credit", row);
    const gradeSelect = $(".course-grade", row);
    const credits = Number(creditInput.value);
    const grade = gradeSelect.value;
    if (creditInput.value.trim() === "" && grade === "") return;
    if (creditInput.value.trim() === "" || !Number.isFinite(credits) || credits <= 0) {
      hasError = true; creditInput.focus(); return;
    }
    if (grade === "") { hasError = true; gradeSelect.focus(); return; }
    totalQualityPoints += Number(grade) * credits;
    totalCredits += credits;
  });
  if (hasError) {
    gpaResult.textContent = "Check your course information.";
    gpaResult.style.color = "var(--danger)";
    return;
  }
  if (totalCredits === 0) {
    gpaResult.textContent = "Add at least one course.";
    gpaResult.style.color = "";
    return;
  }
  gpaResult.textContent = (totalQualityPoints / totalCredits).toFixed(2);
  gpaResult.style.color = "var(--accent)";
});

/* Grade Calculator */
const marksObtained = $("#marksObtained");
const totalMarks = $("#totalMarks");
const calculateGradeButton = $("#calculateGrade");
const gradeResult = $("#gradeResult");
function getLetterGrade(p) { return p >= 90 ? "A" : p >= 80 ? "B" : p >= 70 ? "C" : p >= 60 ? "D" : "F"; }
calculateGradeButton?.addEventListener("click", () => {
  const obtained = Number(marksObtained.value), total = Number(totalMarks.value);
  if (!marksObtained.value.trim() || !totalMarks.value.trim()) {
    gradeResult.textContent = "Please enter both values."; gradeResult.classList.remove("success"); return;
  }
  if (!Number.isFinite(obtained) || !Number.isFinite(total)) {
    gradeResult.textContent = "Please enter valid numbers."; gradeResult.classList.remove("success"); return;
  }
  if (obtained < 0 || total <= 0) {
    gradeResult.textContent = "Please enter positive values."; gradeResult.classList.remove("success"); return;
  }
  if (obtained > total) {
    gradeResult.textContent = "Marks obtained cannot exceed total marks."; gradeResult.classList.remove("success"); return;
  }
  const percentage = obtained / total * 100;
  gradeResult.innerHTML = `<strong>${percentage.toFixed(1)}%</strong><br>Letter grade: ${getLetterGrade(percentage)}`;
  gradeResult.classList.add("success");
});

/* Study Timer */
const timerDisplay = $("#timerDisplay");
const startTimerButton = $("#startTimer");
const pauseTimerButton = $("#pauseTimer");
const resetTimerButton = $("#resetTimer");
const studyModeButton = $("#studyMode");
const breakModeButton = $("#breakMode");
let timerInterval = null, timerSeconds = 1500, timerMode = "study", timerRunning = false;
function updateTimerDisplay() {
  if (timerDisplay) timerDisplay.textContent = `${String(Math.floor(timerSeconds / 60)).padStart(2, "0")}:${String(timerSeconds % 60).padStart(2, "0")}`;
}
function stopTimer() { clearInterval(timerInterval); timerInterval = null; timerRunning = false; }
function setTimerMode(mode) {
  timerMode = mode; stopTimer(); timerSeconds = mode === "study" ? 1500 : 300;
  studyModeButton?.classList.toggle("active", mode === "study");
  breakModeButton?.classList.toggle("active", mode === "break");
  updateTimerDisplay();
}
function startTimer() {
  if (timerRunning) return;
  timerRunning = true;
  timerInterval = setInterval(() => {
    if (timerSeconds > 0) { timerSeconds--; updateTimerDisplay(); }
    else {
      stopTimer();
      if (timerMode === "study" && window.projectFluidV3?.recordStudy) window.projectFluidV3.recordStudy(25);
      setTimerMode(timerMode === "study" ? "break" : "study");
    }
  }, 1000);
}
startTimerButton?.addEventListener("click", startTimer);
pauseTimerButton?.addEventListener("click", stopTimer);
resetTimerButton?.addEventListener("click", () => setTimerMode(timerMode));
studyModeButton?.addEventListener("click", () => setTimerMode("study"));
breakModeButton?.addEventListener("click", () => setTimerMode("break"));
updateTimerDisplay();

/* Exam Countdown */
const examDate = $("#examDate");
const startCountdownButton = $("#startCountdown");
const daysElement = $("#days"), hoursElement = $("#hours"), minutesElement = $("#minutes"), secondsElement = $("#seconds");
let countdownInterval = null;
function updateCountdown() {
  if (!examDate?.value) return;
  const target = new Date(examDate.value).getTime(), difference = target - Date.now();
  if (difference <= 0) {
    daysElement.textContent = hoursElement.textContent = minutesElement.textContent = secondsElement.textContent = "0";
    clearInterval(countdownInterval); return;
  }
  daysElement.textContent = Math.floor(difference / 86400000);
  hoursElement.textContent = Math.floor(difference / 3600000 % 24);
  minutesElement.textContent = Math.floor(difference / 60000 % 60);
  secondsElement.textContent = Math.floor(difference / 1000 % 60);
}
startCountdownButton?.addEventListener("click", () => {
  if (!examDate.value) { alert("Please select an exam date."); return; }
  if (new Date(examDate.value).getTime() <= Date.now()) { alert("Please choose a future exam date."); return; }
  clearInterval(countdownInterval); updateCountdown(); countdownInterval = setInterval(updateCountdown, 1000);
});

/* Quiz Center */
const quizQuestions = {
  "Mathematics": [
    {q:"What is 15% of 200?",o:["15","20","30","40"],a:2,d:"Easy",e:"15% × 200 = 30."},
    {q:"If 3x + 5 = 20, what is x?",o:["3","5","7","8"],a:1,d:"Easy",e:"Subtract 5, then divide by 3: x = 5."},
    {q:"What is the area of a rectangle measuring 8 cm by 5 cm?",o:["13 cm²","26 cm²","40 cm²","80 cm²"],a:2,d:"Easy",e:"Area = length × width = 8 × 5 = 40 cm²."},
    {q:"What is √144?",o:["10","11","12","14"],a:2,d:"Easy",e:"12 × 12 = 144."},
    {q:"Simplify: 2(x + 4) - 3.",o:["2x + 1","2x + 5","2x + 8","2x - 1"],a:1,d:"Medium",e:"2x + 8 - 3 = 2x + 5."},
    {q:"What is the slope of y = 3x - 7?",o:["-7","-3","3","7"],a:2,d:"Medium",e:"In y = mx + b, m is the slope, so m = 3."},
    {q:"A fair die is rolled once. What is the probability of rolling an even number?",o:["1/6","1/3","1/2","2/3"],a:2,d:"Medium",e:"There are 3 even outcomes out of 6: 3/6 = 1/2."},
    {q:"What is the derivative of x²?",o:["x","2x","x²/2","2"],a:1,d:"Hard",e:"Using the power rule, d(x²)/dx = 2x."},
    {q:"If log₁₀(x) = 3, what is x?",o:["30","100","300","1000"],a:3,d:"Hard",e:"10³ = 1000."},
    {q:"What is the sum of the first 10 positive integers?",o:["45","50","55","60"],a:2,d:"Hard",e:"10 × 11 / 2 = 55."}
  ],
  "Physics": [
    {q:"What is the SI unit of force?",o:["Joule","Newton","Watt","Pascal"],a:1,d:"Easy",e:"Force is measured in newtons (N)."},
    {q:"What is the approximate acceleration due to gravity near Earth?",o:["4.9 m/s²","9.8 m/s²","19.6 m/s²","98 m/s²"],a:1,d:"Easy",e:"Near Earth's surface, g is approximately 9.8 m/s²."},
    {q:"Which quantity is measured in watts?",o:["Energy","Power","Force","Momentum"],a:1,d:"Easy",e:"The watt is the SI unit of power."},
    {q:"If an object travels 100 m in 20 s, its average speed is:",o:["2 m/s","5 m/s","20 m/s","2000 m/s"],a:1,d:"Easy",e:"Speed = distance/time = 100/20 = 5 m/s."},
    {q:"Newton's second law is commonly written as:",o:["F = ma","E = mc²","V = IR","P = VI"],a:0,d:"Medium",e:"Net force equals mass times acceleration: F = ma."},
    {q:"What happens to resistance in a metal wire as its temperature generally increases?",o:["It decreases","It increases","It becomes zero","It stays exactly constant"],a:1,d:"Medium",e:"For most metallic conductors, resistance increases with temperature."},
    {q:"Which form of energy is associated with an object's position in a gravitational field?",o:["Kinetic","Thermal","Gravitational potential","Nuclear"],a:2,d:"Medium",e:"Position in a gravitational field gives gravitational potential energy."},
    {q:"A 2 kg object accelerates at 4 m/s². What net force acts on it?",o:["2 N","4 N","6 N","8 N"],a:3,d:"Hard",e:"F = ma = 2 × 4 = 8 N."},
    {q:"What is the momentum of a 5 kg object moving at 3 m/s?",o:["8 kg·m/s","15 kg·m/s","20 kg·m/s","30 kg·m/s"],a:1,d:"Hard",e:"Momentum p = mv = 5 × 3 = 15 kg·m/s."},
    {q:"Which principle states that energy cannot be created or destroyed in an isolated system?",o:["Conservation of momentum","Conservation of energy","Ohm's law","Archimedes' principle"],a:1,d:"Hard",e:"The law of conservation of energy says total energy is conserved."}
  ],
  "Chemistry": [
    {q:"What is the chemical symbol for oxygen?",o:["Ox","O","Og","C"],a:1,d:"Easy",e:"O is the chemical symbol for oxygen."},
    {q:"What is the pH of a neutral solution at room temperature?",o:["0","5","7","14"],a:2,d:"Easy",e:"A neutral solution has a pH of about 7 at room temperature."},
    {q:"How many protons does carbon have?",o:["4","6","8","12"],a:1,d:"Easy",e:"Carbon's atomic number is 6, which equals its proton count."},
    {q:"Which particle has a negative charge?",o:["Proton","Neutron","Electron","Nucleus"],a:2,d:"Easy",e:"Electrons carry negative electric charge."},
    {q:"What type of bond forms when atoms share electrons?",o:["Ionic","Covalent","Metallic","Hydrogen"],a:1,d:"Medium",e:"Covalent bonds involve shared electron pairs."},
    {q:"What is the molar mass of H₂O approximately?",o:["10 g/mol","18 g/mol","22 g/mol","36 g/mol"],a:1,d:"Medium",e:"H₂O is about 2(1) + 16 = 18 g/mol."},
    {q:"Which gas is most abundant in Earth's atmosphere?",o:["Oxygen","Carbon dioxide","Nitrogen","Hydrogen"],a:2,d:"Medium",e:"Nitrogen makes up about 78% of Earth's atmosphere."},
    {q:"What is the oxidation state of oxygen in most compounds?",o:["+2","-2","0","+1"],a:1,d:"Hard",e:"Oxygen is usually assigned an oxidation state of -2, with notable exceptions."},
    {q:"How many moles are in 18 g of water, approximately?",o:["0.5 mol","1 mol","2 mol","18 mol"],a:1,d:"Hard",e:"18 g ÷ 18 g/mol ≈ 1 mol."},
    {q:"Which principle says equal volumes of gases at the same temperature and pressure contain equal numbers of molecules?",o:["Boyle's law","Charles's law","Avogadro's law","Dalton's law"],a:2,d:"Hard",e:"Avogadro's law relates gas volume to amount at constant temperature and pressure."}
  ],
  "Biology": [
    {q:"What is the basic unit of life?",o:["Atom","Tissue","Cell","Organ"],a:2,d:"Easy",e:"The cell is the basic structural and functional unit of life."},
    {q:"Which organelle is often called the powerhouse of the cell?",o:["Nucleus","Ribosome","Mitochondrion","Golgi apparatus"],a:2,d:"Easy",e:"Mitochondria produce much of the cell's usable energy."},
    {q:"Which molecule carries genetic information in most organisms?",o:["ATP","DNA","Glucose","Lipid"],a:1,d:"Easy",e:"DNA stores hereditary genetic information."},
    {q:"What gas do plants commonly take in for photosynthesis?",o:["Oxygen","Nitrogen","Carbon dioxide","Hydrogen"],a:2,d:"Easy",e:"Plants use carbon dioxide, water and light to make sugars during photosynthesis."},
    {q:"What is the main function of red blood cells?",o:["Fight pathogens","Carry oxygen","Digest food","Produce hormones"],a:1,d:"Medium",e:"Red blood cells contain hemoglobin and transport oxygen."},
    {q:"Which process produces two genetically similar daughter cells?",o:["Meiosis","Mitosis","Fertilization","Mutation"],a:1,d:"Medium",e:"Mitosis produces two daughter cells with essentially the same chromosome set."},
    {q:"What is the role of enzymes in biological reactions?",o:["They permanently change DNA","They lower activation energy","They add genetic material","They stop all reactions"],a:1,d:"Medium",e:"Enzymes act as biological catalysts and lower activation energy."},
    {q:"In a simple food chain, what is usually the first trophic level?",o:["Consumers","Decomposers","Producers","Predators"],a:2,d:"Hard",e:"Producers form the first trophic level by making organic food from external energy."},
    {q:"If two heterozygous parents (Aa × Aa) have a dominant-recessive trait, what fraction is expected to be aa?",o:["0%","25%","50%","75%"],a:1,d:"Hard",e:"The genotype ratio is 1 AA : 2 Aa : 1 aa, so aa is 25%."},
    {q:"Which structure controls what enters and leaves a typical cell?",o:["Cell membrane","Nucleolus","Centromere","Cell wall only"],a:0,d:"Hard",e:"The cell membrane regulates movement of many substances into and out of the cell."}
  ],
  "English": [
    {q:"Which word is a synonym for 'rapid'?",o:["Slow","Quick","Heavy","Quiet"],a:1,d:"Easy",e:"Rapid means quick or fast."},
    {q:"Which sentence uses the correct form?",o:["She don't like tea.","She doesn't likes tea.","She doesn't like tea.","She not like tea."],a:2,d:"Easy",e:"With 'she', use 'doesn't' followed by the base verb 'like'."},
    {q:"What is the plural of 'analysis'?",o:["Analysises","Analysis","Analyses","Analys"],a:2,d:"Easy",e:"The plural form is analyses."},
    {q:"Which punctuation mark normally ends a direct question?",o:["Period","Comma","Question mark","Colon"],a:2,d:"Easy",e:"A direct question normally ends with a question mark."},
    {q:"In the sentence 'The bright student answered quickly,' which word is an adjective?",o:["student","answered","bright","quickly"],a:2,d:"Medium",e:"'Bright' describes the noun 'student', so it is an adjective."},
    {q:"Which literary device compares two things using 'like' or 'as'?",o:["Metaphor","Simile","Irony","Hyperbole"],a:1,d:"Medium",e:"A simile makes a comparison using 'like' or 'as'."},
    {q:"Choose the best transition: 'The experiment failed. ___, the team learned something valuable.'",o:["However","Because","Before","Unless"],a:0,d:"Medium",e:"'However' signals a contrast between failure and learning."},
    {q:"What is the main purpose of a thesis statement in an argumentative essay?",o:["To list every source","To state the central claim","To end the essay","To define every word"],a:1,d:"Hard",e:"A thesis communicates the essay's central argument or position."},
    {q:"Which sentence is in the passive voice?",o:["The scientist conducted the test.","The test was conducted by the scientist.","The scientist is conducting the test.","The scientist will conduct the test."],a:1,d:"Hard",e:"In the passive voice, the subject receives the action: 'The test was conducted...'" },
    {q:"What does 'ambiguous' most nearly mean?",o:["Having more than one possible meaning","Extremely loud","Completely certain","Scientifically proven"],a:0,d:"Hard",e:"Ambiguous language can reasonably be interpreted in more than one way."}
  ],
  "Computer Science": [
    {q:"What does CPU stand for?",o:["Central Processing Unit","Computer Personal Utility","Central Program User","Core Processing Utility"],a:0,d:"Easy",e:"CPU stands for Central Processing Unit."},
    {q:"Which number system uses only 0 and 1?",o:["Decimal","Binary","Hexadecimal","Roman"],a:1,d:"Easy",e:"Binary uses two digits: 0 and 1."},
    {q:"What does HTML primarily describe?",o:["Web page structure","Database passwords","Computer hardware","Internet speed"],a:0,d:"Easy",e:"HTML defines the structure and content of web pages."},
    {q:"Which device is commonly used to connect multiple devices on a local network?",o:["Switch","Keyboard","Monitor","Printer"],a:0,d:"Easy",e:"A network switch connects devices on a local area network."},
    {q:"What is an algorithm?",o:["A programming language","A step-by-step procedure for solving a problem","A type of monitor","A database table"],a:1,d:"Medium",e:"An algorithm is a defined sequence of steps for solving a problem or performing a task."},
    {q:"Which data structure follows FIFO order?",o:["Stack","Queue","Tree","Graph"],a:1,d:"Medium",e:"A queue is first-in, first-out (FIFO)."},
    {q:"What does CSS control on a web page?",o:["Presentation and styling","Database storage","Server electricity","File compression only"],a:0,d:"Medium",e:"CSS controls visual presentation such as layout, colors, spacing and typography."},
    {q:"What is the time complexity of binary search on a sorted array?",o:["O(1)","O(log n)","O(n)","O(n²)"],a:1,d:"Hard",e:"Binary search halves the search space each step, giving O(log n) time."},
    {q:"Which HTTP status code commonly means 'Not Found'?",o:["200","301","404","500"],a:2,d:"Hard",e:"HTTP 404 indicates that the requested resource was not found."},
    {q:"What is the main purpose of version control systems such as Git?",o:["Track changes to files and collaborate","Increase monitor brightness","Replace all programming languages","Encrypt every website automatically"],a:0,d:"Hard",e:"Version control tracks changes, supports collaboration and allows previous versions to be recovered."}
  ]
};

let quizSubject = "Mathematics";
let quizDifficulty = "Mixed";
let quizPool = [];
let quizIndex = 0;
let quizScore = 0;
let quizAnswers = [];
let quizTimerInterval = null;
let quizSeconds = 600;

const quizSetup = $("#quizSetup");
const quizGame = $("#quizGame");
const quizResults = $("#quizResults");
const startQuizButton = $("#startQuiz");
const retryQuizButton = $("#retryQuiz");
const reviewQuizButton = $("#reviewQuiz");
const newQuizButton = $("#newQuiz");
const nextQuestionButton = $("#nextQuestion");
const quizSubjectLabel = $("#quizSubjectLabel");
const quizTimer = $("#quizTimer");
const quizProgressBar = $("#quizProgressBar");
const quizQuestionCount = $("#quizQuestionCount");
const quizScoreLive = $("#quizScoreLive");
const quizQuestion = $("#quizQuestion");
const quizOptions = $("#quizOptions");
const quizFeedback = $("#quizFeedback");
const quizScoreElement = $("#quizScore");
const quizMessage = $("#quizMessage");
const quizStats = $("#quizStats");
const bestScoreElement = $("#bestScore");
const quizStreakElement = $("#quizStreak");
const quizReview = $("#quizReview");

startQuizButton?.addEventListener("click", startQuiz);

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function buildQuizPool() {
  const questions = quizQuestions[quizSubject] || [];
  if (quizDifficulty === "Mixed") return shuffle(questions).slice(0, 10);
  const target = shuffle(questions.filter(q => q.d === quizDifficulty));
  const rest = shuffle(questions.filter(q => q.d !== quizDifficulty));
  return [...target, ...rest].slice(0, 10);
}

function setChoice(groupSelector, property, value) {
  $$(groupSelector).forEach(button => {
    button.classList.toggle("active", button.dataset[property] === value);
  });
}
$$("[data-subject]").forEach(button => {
  button.addEventListener("click", () => {
    quizSubject = button.dataset.subject;
    setChoice("[data-subject]", "subject", quizSubject);
  });
});
$$("[data-difficulty]").forEach(button => {
  button.addEventListener("click", () => {
    quizDifficulty = button.dataset.difficulty;
    setChoice("[data-difficulty]", "difficulty", quizDifficulty);
  });
});

function updateQuizTimer() {
  const minutes = Math.floor(quizSeconds / 60);
  const seconds = quizSeconds % 60;
  quizTimer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
function stopQuizTimer() {
  clearInterval(quizTimerInterval);
  quizTimerInterval = null;
}
function startQuizTimer() {
  stopQuizTimer();
  quizTimerInterval = setInterval(() => {
    quizSeconds--;
    updateQuizTimer();
    if (quizSeconds <= 0) {
      stopQuizTimer();
      finishQuiz(true);
    }
  }, 1000);
}

function startQuiz() {
  quizPool = buildQuizPool();
  quizIndex = 0;
  quizScore = 0;
  quizAnswers = [];
  quizSeconds = 600;
  quizSetup.classList.add("hidden");
  quizResults.classList.add("hidden");
  quizGame.classList.remove("hidden");
  quizSubjectLabel.textContent = `${quizSubject} · ${quizDifficulty}`;
  startQuizTimer();
  renderQuestion();
}

function renderQuestion() {
  const current = quizPool[quizIndex];
  if (!current) return;
  quizQuestionCount.textContent = `Question ${quizIndex + 1} of ${quizPool.length}`;
  quizScoreLive.textContent = `${quizScore} correct`;
  quizProgressBar.style.width = `${((quizIndex + 1) / quizPool.length) * 100}%`;
  quizQuestion.textContent = current.q;
  quizOptions.innerHTML = "";
  quizFeedback.textContent = "";
  quizFeedback.className = "quiz-feedback";
  nextQuestionButton.classList.add("hidden");

  current.o.forEach((option, index) => {
    const button = document.createElement("button");
    button.className = "quiz-option";
    button.type = "button";
    button.textContent = `${String.fromCharCode(65 + index)}. ${option}`;
    button.addEventListener("click", () => answerQuestion(index));
    quizOptions.appendChild(button);
  });
}

function answerQuestion(selectedIndex) {
  const current = quizPool[quizIndex];
  const optionButtons = $$(".quiz-option", quizOptions);
  optionButtons.forEach(button => button.disabled = true);

  const isCorrect = selectedIndex === current.a;
  if (isCorrect) quizScore++;

  optionButtons[current.a]?.classList.add("correct");
  if (!isCorrect) optionButtons[selectedIndex]?.classList.add("wrong");

  quizAnswers.push({
    question: current.q,
    selected: current.o[selectedIndex],
    correct: current.o[current.a],
    isCorrect,
    explanation: current.e
  });

  quizFeedback.textContent = isCorrect ? `Correct! ${current.e}` : `Not quite. ${current.e}`;
  quizFeedback.className = `quiz-feedback ${isCorrect ? "correct" : "wrong"}`;
  nextQuestionButton.textContent = quizIndex === quizPool.length - 1 ? "See results →" : "Next question →";
  nextQuestionButton.classList.remove("hidden");
  quizScoreLive.textContent = `${quizScore} correct`;
}

nextQuestionButton?.addEventListener("click", () => {
  if (quizIndex >= quizPool.length - 1) {
    finishQuiz(false);
  } else {
    quizIndex++;
    renderQuestion();
  }
});

function getQuizStats() {
  const best = storage.get("pf-quiz-best", 0);
  return Number(best) || 0;
}
function updateQuizStreak() {
  const data = storage.get("pf-quiz-streak", {count:0,lastDate:""});
  const today = new Date().toISOString().slice(0, 10);
  if (data.lastDate === today) return data.count;
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toISOString().slice(0, 10);
  data.count = data.lastDate === yesterday ? data.count + 1 : 1;
  data.lastDate = today;
  storage.set("pf-quiz-streak", data);
  return data.count;
}

function finishQuiz(timeUp) {
  stopQuizTimer();
  const percentage = Math.round((quizScore / quizPool.length) * 100);
  const best = Math.max(getQuizStats(), percentage);
  storage.set("pf-quiz-best", best);
  const streak = updateQuizStreak();

  quizGame.classList.add("hidden");
  quizResults.classList.remove("hidden");
  quizScoreElement.textContent = `${quizScore}/${quizPool.length}`;
  quizMessage.textContent = percentage >= 90 ? "Excellent work." : percentage >= 70 ? "Solid progress." : percentage >= 50 ? "Keep practicing." : "Good start — try again.";
  quizStats.textContent = `${percentage}% in ${quizSubject}${timeUp ? " · Time ran out" : ""}`;
  bestScoreElement.textContent = `${best}%`;
  quizStreakElement.textContent = streak;
  updateProgressStats();
  if (window.projectFluidV3?.recordQuiz) window.projectFluidV3.recordQuiz(percentage, quizSubject);
  quizReview.classList.add("hidden");
  quizReview.innerHTML = "";
}

retryQuizButton?.addEventListener("click", startQuiz);
newQuizButton?.addEventListener("click", () => {
  quizResults.classList.add("hidden");
  quizSetup.classList.remove("hidden");
  document.querySelector("#learn")?.scrollIntoView({ behavior: "smooth" });
});
reviewQuizButton?.addEventListener("click", () => {
  quizReview.classList.toggle("hidden");
  if (quizReview.classList.contains("hidden")) return;
  quizReview.innerHTML = "";
  quizAnswers.forEach((answer, index) => {
    const item = document.createElement("article");
    item.className = "review-item";
    const heading = document.createElement("h4");
    heading.textContent = `${index + 1}. ${answer.question}`;
    const user = document.createElement("p");
    user.textContent = `Your answer: ${answer.selected}`;
    user.className = answer.isCorrect ? "review-correct" : "review-wrong";
    const correct = document.createElement("p");
    correct.textContent = `Correct answer: ${answer.correct}`;
    const explanation = document.createElement("p");
    explanation.textContent = answer.explanation;
    item.append(heading, user, correct, explanation);
    quizReview.appendChild(item);
  });
});

/* Planner */
let tasks = storage.get("pf-tasks", []);
const taskForm = $("#taskForm");
const taskInput = $("#taskInput");
const taskDate = $("#taskDate");
const taskPriority = $("#taskPriority");
const taskList = $("#taskList");
const clearCompleted = $("#clearCompleted");

function renderTasks() {
  taskList.innerHTML = "";
  if (!tasks.length) {
    const empty = document.createElement("p");
    empty.className = "muted-copy";
    empty.textContent = "No tasks yet. Add your next study goal above.";
    taskList.appendChild(empty);
  }
  tasks.forEach(task => {
    const item = document.createElement("div");
    item.className = `task-item ${task.done ? "done" : ""}`;
    const check = document.createElement("input");
    check.type = "checkbox"; check.className = "task-check"; check.checked = task.done;
    check.addEventListener("change", () => {
      task.done = check.checked; storage.set("pf-tasks", tasks); renderTasks(); updateProgressStats();
    });
    const body = document.createElement("div");
    const title = document.createElement("div"); title.className = "task-title"; title.textContent = task.title;
    const meta = document.createElement("div"); meta.className = "task-meta";
    meta.textContent = `${task.priority}${task.due ? ` · Due ${task.due}` : ""}`;
    body.append(title, meta);
    const del = document.createElement("button"); del.className = "task-delete"; del.type = "button"; del.textContent = "×"; del.setAttribute("aria-label","Delete task");
    del.addEventListener("click", () => { tasks = tasks.filter(t => t.id !== task.id); storage.set("pf-tasks", tasks); renderTasks(); updateProgressStats(); });
    item.append(check, body, del);
    taskList.appendChild(item);
  });
}
taskForm?.addEventListener("submit", event => {
  event.preventDefault();
  tasks.unshift({ id: Date.now(), title: taskInput.value.trim(), due: taskDate.value, priority: taskPriority.value, done:false });
  storage.set("pf-tasks", tasks);
  taskForm.reset();
  renderTasks(); updateProgressStats();
});
clearCompleted?.addEventListener("click", () => {
  tasks = tasks.filter(task => !task.done);
  storage.set("pf-tasks", tasks); renderTasks(); updateProgressStats();
});

/* Notes */
let notes = storage.get("pf-notes", []);
const noteForm = $("#noteForm");
const notesList = $("#notesList");
function renderNotes() {
  notesList.innerHTML = "";
  if (!notes.length) {
    const empty = document.createElement("p");
    empty.className = "muted-copy"; empty.textContent = "No notes yet. Save a quick revision note above.";
    notesList.appendChild(empty);
  }
  notes.forEach(note => {
    const item = document.createElement("article"); item.className = "note-item";
    const title = document.createElement("strong"); title.textContent = note.title;
    const body = document.createElement("p"); body.textContent = note.body;
    const actions = document.createElement("div"); actions.className = "note-actions";
    const del = document.createElement("button"); del.className = "note-delete"; del.textContent = "Delete";
    del.addEventListener("click", () => { notes = notes.filter(n => n.id !== note.id); storage.set("pf-notes", notes); renderNotes(); updateProgressStats(); });
    actions.appendChild(del); item.append(title, body, actions); notesList.appendChild(item);
  });
}
noteForm?.addEventListener("submit", event => {
  event.preventDefault();
  notes.unshift({ id: Date.now(), title: $("#noteTitle").value.trim(), body: $("#noteBody").value.trim() });
  storage.set("pf-notes", notes); noteForm.reset(); renderNotes(); updateProgressStats();
});

/* Flashcards */
let flashcards = storage.get("pf-flashcards", []);
const flashFront = $("#flashFront"), flashBack = $("#flashBack"), addFlashcard = $("#addFlashcard"), flashcardDeck = $("#flashcardDeck");
function renderFlashcards() {
  flashcardDeck.innerHTML = "";
  if (!flashcards.length) {
    const empty = document.createElement("p"); empty.className = "muted-copy"; empty.textContent = "No cards yet. Add one above and tap it to flip.";
    flashcardDeck.appendChild(empty); return;
  }
  flashcards.forEach(card => {
    const item = document.createElement("article"); item.className = "flashcard";
    let flipped = false;
    const label = document.createElement("span"); label.className = "flashcard-label"; label.textContent = "FRONT";
    const text = document.createElement("div"); text.className = "flashcard-text"; text.textContent = card.front;
    const del = document.createElement("button"); del.className = "flashcard-delete"; del.type = "button"; del.textContent = "Delete";
    del.addEventListener("click", event => {
      event.stopPropagation();
      flashcards = flashcards.filter(c => c.id !== card.id); storage.set("pf-flashcards", flashcards); renderFlashcards();
    });
    item.addEventListener("click", () => {
      flipped = !flipped;
      label.textContent = flipped ? "BACK" : "FRONT";
      text.textContent = flipped ? card.back : card.front;
      item.classList.toggle("is-flipped", flipped);
    });
    item.append(label, text, del); flashcardDeck.appendChild(item);
  });
}
addFlashcard?.addEventListener("click", () => {
  const front = flashFront.value.trim(), back = flashBack.value.trim();
  if (!front || !back) { alert("Please enter both sides of the flashcard."); return; }
  flashcards.unshift({id:Date.now(), front, back});
  storage.set("pf-flashcards", flashcards); flashFront.value = ""; flashBack.value = ""; renderFlashcards();
});

/* Progress */
function updateProgressStats() {
  const best = getQuizStats();
  const streak = storage.get("pf-quiz-streak", {count:0}).count || 0;
  const completed = tasks.filter(task => task.done).length;
  $("#progressBest").textContent = `${best}%`;
  $("#progressStreak").textContent = streak;
  $("#progressTasks").textContent = completed;
  $("#progressNotes").textContent = notes.length;
}
renderTasks();
renderNotes();
renderFlashcards();
updateProgressStats();

/* Visual effects */
const reducedMotion = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
const blobs = $$(".blob");
const supportsFinePointer = window.matchMedia("(hover:hover) and (pointer:fine)").matches;
if (blobs.length && supportsFinePointer && !reducedMotion) {
  let mouseX=0, mouseY=0, currentX=0, currentY=0;
  window.addEventListener("mousemove", e => {
    mouseX=(e.clientX/innerWidth-.5)*2; mouseY=(e.clientY/innerHeight-.5)*2;
  }, {passive:true});
  function animateLiquid() {
    currentX+=(mouseX-currentX)*.035; currentY+=(mouseY-currentY)*.035;
    if(blobs[0]){blobs[0].style.marginLeft=`${currentX*25}px`;blobs[0].style.marginTop=`${currentY*20}px`}
    if(blobs[1]){blobs[1].style.marginLeft=`${currentX*-20}px`;blobs[1].style.marginTop=`${currentY*-25}px`}
    if(blobs[2]){blobs[2].style.marginLeft=`${currentX*15}px`;blobs[2].style.marginTop=`${currentY*-15}px`}
    requestAnimationFrame(animateLiquid);
  }
  animateLiquid();
}

const revealElements = $$(".tool-card,.benefit,.section-heading,.final-cta,.quiz-shell,.planner-card,.flashcard-card,.stat-card");
if(revealElements.length && !reducedMotion && "IntersectionObserver" in window) {
  revealElements.forEach(e => { e.style.opacity="0"; e.style.transform="translateY(30px)"; e.style.transition="opacity .8s ease,transform .8s ease"; });
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if(!entry.isIntersecting) return;
      entry.target.style.opacity="1"; entry.target.style.transform="translateY(0)";
      obs.unobserve(entry.target);
    });
  }, {threshold:.12});
  revealElements.forEach(e => observer.observe(e));
}

$$('a[href^="#"]').forEach(link => link.addEventListener("click", e => {
  const target = document.querySelector(link.getAttribute("href"));
  if(!target) return;
  e.preventDefault();
  target.scrollIntoView({behavior:reducedMotion ? "auto" : "smooth"});
}));

console.log("Project Fluid V2 loaded successfully.");


/* ===== Project Fluid V3 enhancement layer ===== */
(() => {
  const V3_KEY = "projectFluidV3";
  const $v3 = (s) => document.querySelector(s);
  const todayKey = () => new Date().toISOString().slice(0,10);

  const defaults = {
    xp: 0, studyMinutes: 0, quizHistory: [], achievements: {},
    planner: [], reminder: {enabled:false,time:"18:00"}, dailyQuestionDate: ""
  };
  let data;
  try { data = {...defaults, ...JSON.parse(localStorage.getItem(V3_KEY) || "{}")}; }
  catch { data = {...defaults}; }
  data.quizHistory = Array.isArray(data.quizHistory) ? data.quizHistory : [];
  data.achievements = data.achievements || {};
  data.planner = Array.isArray(data.planner) ? data.planner : [];
  data.reminder = {...defaults.reminder, ...(data.reminder||{})};

  const save = () => localStorage.setItem(V3_KEY, JSON.stringify(data));
  const level = () => Math.floor(data.xp / 100) + 1;
  const levelXP = () => data.xp % 100;

  const achievements = [
    ["first-quiz","🧠","First Step","Complete your first quiz."],
    ["quiz-5","🎯","Quiz Regular","Complete 5 quizzes."],
    ["perfect","💯","Perfect Score","Score 100% on a quiz."],
    ["streak-3","🔥","On Fire","Reach a 3-day quiz streak."],
    ["study-60","⏱️","Focused","Study for 60 minutes total."],
    ["xp-500","⭐","Rising Scholar","Earn 500 XP."]
  ];

  function unlock(id){
    if (!data.achievements[id]) {
      data.achievements[id] = Date.now();
      save();
      toast("Achievement unlocked! 🏆");
    }
  }
  function updateAchievements(){
    const q = data.quizHistory;
    if(q.length >= 1) unlock("first-quiz");
    if(q.length >= 5) unlock("quiz-5");
    if(q.some(x => Number(x.score) >= 100)) unlock("perfect");
    if((window.quizStreak || 0) >= 3 || Number(localStorage.getItem("quizStreak")||0) >= 3) unlock("streak-3");
    if(data.studyMinutes >= 60) unlock("study-60");
    if(data.xp >= 500) unlock("xp-500");
  }

  function renderDashboard(){
    const xp = $v3("#dashboardXP"); if(!xp) return;
    const lvl = level(), current = levelXP();
    const best = data.quizHistory.reduce((a,b) => Number(b.score)>Number(a.score||-1)?b:a, null);
    $v3("#dashboardLevel").textContent = lvl;
    $v3("#dashboardLevelText").textContent = `Level ${lvl}`;
    xp.textContent = data.xp;
    $v3("#dashboardXPNext").textContent = `${100-current || 100} XP to next level`;
    $v3("#dashboardStreak").textContent = localStorage.getItem("quizStreak") || "0";
    $v3("#dashboardMinutes").textContent = data.studyMinutes;
    $v3("#dashboardBest").textContent = best ? `${best.score}%` : "—";
    $v3("#dashboardBestSubject").textContent = best?.subject || "No quiz yet";
    $v3("#dashboardLevelBar").style.width = `${current}%`;
    $v3("#dashboardProgressText").textContent = `${current} / 100 XP`;
    $v3("#dashboardMotivation").textContent = data.xp
      ? `You're at Level ${lvl}. Keep building your study streak.`
      : "Start a quiz or focus session to earn your first XP.";
    $v3("#todayDate").textContent = new Date().toLocaleDateString(undefined,{month:"short",day:"numeric"});
    renderTasks();
    renderAchievementPreview();
  }

  function renderTasks(){
    const box=$v3("#todayTasks"); if(!box) return;
    const today=todayKey();
    const tasks=data.planner.filter(t => !t.date || t.date===today).slice(0,5);
    box.innerHTML = tasks.length ? tasks.map(t=>`<div class="mini-task ${t.done?"done":""}"><span>${t.done?"✓":"○"}</span><span>${escapeHTML(t.title)}</span></div>`).join("") : '<p class="empty-state">No study tasks yet. Add one in the planner.</p>';
  }

  function renderAchievementPreview(){
    const box=$v3("#achievementPreview"); if(!box) return;
    box.innerHTML = achievements.map(([id,icon])=>`<div class="achievement-badge ${data.achievements[id]?"":"locked"}" title="${id}">${icon}</div>`).slice(0,6).join("");
  }

  function renderAchievementModal(){
    const box=$v3("#achievementList"); if(!box) return;
    box.innerHTML = achievements.map(([id,icon,name,desc])=>`
      <div class="achievement-item">
        <div class="achievement-badge ${data.achievements[id]?"":"locked"}">${icon}</div>
        <div><strong>${name} ${data.achievements[id]?"✓":""}</strong><p>${desc}</p></div>
      </div>`).join("");
  }

  function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}

  function toast(message){
    document.body.classList.add("v3-toast-ready");
    let el=$v3(".toast"); if(!el){el=document.createElement("div");el.className="toast";document.body.appendChild(el);}
    el.textContent=message; clearTimeout(window.__v3toast); window.__v3toast=setTimeout(()=>el.remove(),2800);
  }

  function awardXP(amount, reason){
    data.xp += Number(amount)||0;
    save(); updateAchievements(); renderDashboard();
    if(reason) toast(`+${amount} XP — ${reason}`);
  }

  // Expose helpers so the existing V2 quiz/timer code can award XP without being rewritten.
  window.projectFluidV3 = {data, save, awardXP, recordQuiz, recordStudy, renderDashboard, updateAchievements};

  // Direct integration hooks are used instead of DOM mutation observers.
  // This avoids duplicate XP/history entries and is more reliable on GitHub Pages.
  function recordQuiz(score, subject){
    data.quizHistory.push({score:Number(score)||0, subject:subject||"Quiz", date:todayKey()});
    awardXP(25 + (Number(score)===100 ? 25 : 0), "Quiz completed");
  }
  function recordStudy(minutes){
    data.studyMinutes += Number(minutes)||0;
    awardXP(10, "Focus session");
  }

  // Daily reminder.
  function reminderStatus(){
    const el=$v3("#reminderStatus"); if(!el) return;
    el.textContent=data.reminder.enabled ? `Daily reminder set for ${data.reminder.time}.` : "Reminders are currently off.";
  }
  function checkReminder(){
    if(!data.reminder.enabled) return;
    const now=new Date();
    const hhmm=now.toTimeString().slice(0,5);
    const firedKey=`${todayKey()}-${hhmm}`;
    if(hhmm===data.reminder.time && localStorage.getItem("lastReminder")!==firedKey){
      localStorage.setItem("lastReminder",firedKey);
      if("Notification" in window && Notification.permission==="granted") new Notification("Project Fluid", {body:"Time for your study session 📚"});
      else toast("📚 Time for your study session!");
    }
  }

  document.addEventListener("DOMContentLoaded",()=>{
    updateAchievements(); renderDashboard(); reminderStatus(); setInterval(checkReminder,30000);

    $v3("#viewAchievements")?.addEventListener("click",()=>{$v3("#achievementsModal").hidden=false;renderAchievementModal()});
    document.querySelectorAll("[data-close-achievements]").forEach(e=>e.addEventListener("click",()=>{$v3("#achievementsModal").hidden=true}));
    $v3("#openReminders")?.addEventListener("click",()=>{$v3("#reminderModal").hidden=false; reminderStatus()});
    document.querySelectorAll("[data-close-reminder]").forEach(e=>e.addEventListener("click",()=>{$v3("#reminderModal").hidden=true}));
    $v3("#saveReminder")?.addEventListener("click",()=>{
      data.reminder.enabled=$v3("#reminderEnabled").checked;
      data.reminder.time=$v3("#reminderTime").value||"18:00";
      save(); reminderStatus(); toast(data.reminder.enabled?"Reminder saved 🔔":"Reminders turned off");
    });
    $v3("#requestNotifications")?.addEventListener("click",async()=>{
      if(!("Notification" in window)){toast("Notifications aren't supported in this browser.");return;}
      const permission=await Notification.requestPermission();
      toast(permission==="granted"?"Notifications enabled 🔔":"Notification permission was not granted.");
    });
    document.querySelectorAll("[data-scroll]").forEach(b=>b.addEventListener("click",()=>{
      document.querySelector(b.dataset.scroll)?.scrollIntoView({behavior:"smooth"});
    }));
  });
})();


/* V4 cloud history sync: keeps existing local features working while adding cloud copies. */
(function setupV4CloudHistory(){
  const originalRecordQuiz=window.projectFluidV3?.recordQuiz;
  const originalRecordStudy=window.projectFluidV3?.recordStudy;
  if(originalRecordQuiz && window.projectFluidV3){
    window.projectFluidV3.recordQuiz=async function(score,subject){
      originalRecordQuiz(score,subject);
      if(!supabaseClient || !currentUser) return;
      try{
        const total=10, pct=Math.max(0,Math.min(100,Number(score)||0));
        const correct=Math.round((pct/100)*total);
        await supabaseClient.from("quiz_history").insert({user_id:currentUser.id,subject:subject||"Quiz",difficulty:"Mixed",score:correct,total_questions:total,percentage:pct});
        const d=window.projectFluidV3.data;
        await supabaseClient.from("profiles").update({xp:Number(d.xp)||0,level:Number(d.level)||1,streak:Number(d.streak)||0,total_study_minutes:Number(d.studyMinutes)||0,updated_at:new Date().toISOString()}).eq("id",currentUser.id);
      }catch(e){console.error("Quiz cloud sync error",e);}
    };
  }
  if(originalRecordStudy && window.projectFluidV3){
    window.projectFluidV3.recordStudy=async function(minutes){
      originalRecordStudy(minutes);
      if(!supabaseClient || !currentUser) return;
      try{
        const d=window.projectFluidV3.data;
        await supabaseClient.from("profiles").update({total_study_minutes:Number(d.studyMinutes)||0,xp:Number(d.xp)||0,level:Number(d.level)||1,streak:Number(d.streak)||0,updated_at:new Date().toISOString()}).eq("id",currentUser.id);
      }catch(e){console.error("Study cloud sync error",e);}
    };
  }
  initV4Auth();
})();
