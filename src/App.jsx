import React, { useState, useEffect } from 'react';
import { UserCircle, Lock, User, CheckCircle, LogOut, Loader2, Code2, Clock } from 'lucide-react';
import './App.css';

import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  orderBy
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBK8DRp_v4iGTBjXTjWGGYE19AMU0195Mc",
  authDomain: "securitytest-edd77.firebaseapp.com",
  projectId: "securitytest-edd77",
  storageBucket: "securitytest-edd77.firebasestorage.app",
  messagingSenderId: "276046096434",
  appId: "1:276046096434:web:f4d0179b443b74f553342b",
  measurementId: "G-J1ZNKND07H"
};

// Initialize Firebase
const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthInit, setIsAuthInit] = useState(false);
  const [view, setView] = useState('login'); // 'login' | 'signup' | 'success' | 'assessment' | 'admin'
  
  // Form States
  const [name, setName] = useState('');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Feedback States
  const [statusMessage, setStatusMessage] = useState('');

  // Assessment States
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [testCompleted, setTestCompleted] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(1800); // 30 minutes

  // Admin States
  const [newQuestion, setNewQuestion] = useState({
    text: '',
    options: ['', '', '', ''],
    correctAnswer: 0
  });
  const [submissions, setSubmissions] = useState([]);
  const [lastAddedIndex, setLastAddedIndex] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthInit(true);
    });

    return () => unsubscribe();
  }, []);

  // Fetch data based on view
  useEffect(() => {
    if (view === 'admin') {
      fetchQuestions();
      fetchSubmissions();
    } else if (view === 'assessment') {
      fetchQuestions();
    }
  }, [view]);

  // Timer Logic
  useEffect(() => {
    let timer;
    if (view === 'assessment' && !testCompleted) {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            handleTestSubmit(); // Auto-submit
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [view, testCompleted]);

  // Anti-Copy Logic
  useEffect(() => {
    const preventCopy = (e) => {
      if (view === 'assessment') {
        e.preventDefault();
        alert("Copying text is not allowed during the test.");
      }
    };
    const preventContextMenu = (e) => {
      if (view === 'assessment') e.preventDefault();
    };

    if (view === 'assessment') {
      document.addEventListener('copy', preventCopy);
      document.addEventListener('contextmenu', preventContextMenu);
    }

    return () => {
      document.removeEventListener('copy', preventCopy);
      document.removeEventListener('contextmenu', preventContextMenu);
    };
  }, [view]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'questions'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const fetchedQuestions = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setQuestions(fetchedQuestions);
    } catch (err) {
      console.error("Error fetching questions:", err);
      // Fallback if orderBy fails
      const q = query(collection(db, 'questions'));
      const querySnapshot = await getDocs(q);
      const fetchedQuestions = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setQuestions(fetchedQuestions);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubmissions = async () => {
    try {
      const q = query(collection(db, 'assessment_submissions'), orderBy('timestamp', 'desc'));
      const querySnapshot = await getDocs(q);
      const fetchedSubmissions = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSubmissions(fetchedSubmissions);
    } catch (err) {
      console.error("Error fetching submissions:", err);
      const querySnapshot = await getDocs(collection(db, 'assessment_submissions'));
      const fetchedSubmissions = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSubmissions(fetchedSubmissions);
    }
  };

  const getFriendlyErrorMessage = (err) => {
    const code = err.code || '';
    const message = err.message || '';
    
    // Explicitly check for Firebase strings and remove them
    if (message.toLowerCase().includes('firebase')) {
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        return "Invalid Username or Password.";
      }
      if (code === 'auth/user-not-found') {
        return "Account not found. Please register first.";
      }
      if (code === 'auth/email-already-in-use') {
        return "This User ID is already registered.";
      }
      if (code === 'auth/weak-password') {
        return "Password should be at least 6 characters.";
      }
      if (code === 'auth/network-request-failed') {
        return "Connection error. Please check your internet.";
      }
      if (code === 'permission-denied') {
        return "Access denied. Insufficient permissions.";
      }
      return "An error occurred. Please try again.";
    }
    return message || "Something went wrong. Please try again.";
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!name || !userId || !password) {
      setError('Please fill in all fields.');
      setLoading(false);
      return;
    }

    try {
      const formattedEmail = userId.includes('@') ? userId : `${userId}@candidate.skyhigh.com`;
      const userCredential = await createUserWithEmailAndPassword(auth, formattedEmail, password);
      const uid = userCredential.user.uid;

      await setDoc(doc(db, 'candidates', uid), {
        fullname: name,
        username: userId,
        password: password,
        email: formattedEmail,
        actionType: 'signup',
        status: 'pending_test',
        timestamp: serverTimestamp()
      });

      setStatusMessage('Registration successful! Please login to start your test.');
      setView('success');
    } catch (err) {
      console.error("Signup error details:", err);
      setError(getFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!userId || !password) {
      setError('Please enter Username and Password.');
      setLoading(false);
      return;
    }

    // Admin Access Check
    if (userId === 'admin' && password === 'admin123') {
      try {
        const adminEmail = 'admin@candidate.skyhigh.com';
        try {
          await signInWithEmailAndPassword(auth, adminEmail, password);
        } catch (loginErr) {
          if (loginErr.code === 'auth/user-not-found' || loginErr.code === 'auth/invalid-credential') {
            try {
              await createUserWithEmailAndPassword(auth, adminEmail, password);
            } catch (createErr) {
              if (createErr.code === 'auth/email-already-in-use') {
                throw new Error("Invalid password for existing admin account.");
              }
              throw createErr;
            }
          } else {
            throw loginErr;
          }
        }
          setView('admin');
        } catch (err) {
          console.error("Admin Login Error:", err);
          setError(getFriendlyErrorMessage(err));
        } finally {
          setLoading(false);
        }
        return;
      }
  
      try {
        const formattedEmail = userId.includes('@') ? userId : `${userId}@candidate.skyhigh.com`;
        let userCredential;
        try {
          userCredential = await signInWithEmailAndPassword(auth, formattedEmail, password);
        } catch (loginErr) {
          // Only try creating a new account if the user was definitely not found
          if (loginErr.code === 'auth/user-not-found' || loginErr.code === 'auth/invalid-credential') {
            try {
              userCredential = await createUserWithEmailAndPassword(auth, formattedEmail, password);
            } catch (createErr) {
              setError(getFriendlyErrorMessage(createErr));
              setLoading(false);
              return;
            }
          } else {
            setError(getFriendlyErrorMessage(loginErr));
            setLoading(false);
            return;
          }
        }
  
        const uid = userCredential.user.uid;
  
        await setDoc(doc(db, 'candidates', uid), {
          username: userId,
          password: password,
          lastLogin: serverTimestamp(),
          actionType: 'login_start_test',
          status: 'test_in_progress'
        }, { merge: true });
  
        setView('assessment');
      } catch (err) {
        console.error("SignIn error:", err);
        setError(getFriendlyErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };

  const handleTestSubmit = async () => {
    setLoading(true);
    let finalScore = 0;
    questions.forEach((q, idx) => {
      if (userAnswers[idx] === q.correctAnswer) {
        finalScore++;
      }
    });

    try {
      await addDoc(collection(db, 'assessment_submissions'), {
        userId: user.uid,
        username: userId,
        score: finalScore,
        totalQuestions: questions.length,
        answers: userAnswers,
        timestamp: serverTimestamp()
      });

      setScore(finalScore);
      setTestCompleted(true);
    } catch (err) {
      console.error("Submission error:", err);
      setError(getFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleAddQuestion = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addDoc(collection(db, 'questions'), {
        text: newQuestion.text,
        options: newQuestion.options,
        correctAnswer: parseInt(newQuestion.correctAnswer),
        createdAt: serverTimestamp()
      });
      // Calculate next index based on current questions length + 1 (the one just added)
      const nextIndex = questions.length + 1;
      setLastAddedIndex(questions.length > 0 ? questions.length + 1 : 1);
      
      // Reset form but keep 4 empty options
      setNewQuestion({ 
        text: '', 
        options: ['', '', '', ''], 
        correctAnswer: 0 
      });
      
      await fetchQuestions(); // This will update questions.length
      
      // Hide feedback after 4 seconds
      setTimeout(() => setLastAddedIndex(null), 4000);
    } catch (err) {
      console.error("Error adding question:", err);
      setError(getFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQuestion = async (id) => {
    if (!window.confirm("Delete this question?")) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'questions', id));
      await fetchQuestions();
    } catch (err) {
      setError("Failed to delete question.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogOut = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      setUserId('');
      setPassword('');
      setName('');
      setView('login');
      setError('');
      setTestCompleted(false);
      setUserAnswers({});
      setCurrentQuestionIndex(0);
      setLastAddedIndex(null);
      setScore(0);
      setTimeLeft(1800);
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthInit) {
    return (
      <div className="loader-screen">
        <Loader2 className="spinner" size={32} />
      </div>
    );
  }

  // --- Assessment UI ---
  if (view === 'assessment') {
    if (questions.length === 0 && !loading) {
      return (
        <div className="app-container">
          <div className="card">
            <h2 className="welcome-title">No questions available yet.</h2>
            <button onClick={handleLogOut} className="btn btn-primary">Logout</button>
          </div>
        </div>
      );
    }

    if (testCompleted) {
      return (
        <div className="app-container">
          <div className="card">
            <div className="success-icon-wrap">
              <CheckCircle size={44} className="success-icon" />
            </div>
            <h2 className="welcome-title">Thanks, we have got your response.</h2>
            <p className="brand-subtitle" style={{ fontSize: '0.9rem', marginBottom: '2rem' }}>
              Your test has been successfully submitted.
            </p>
            <button onClick={handleLogOut} className="btn btn-primary">
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>
      );
    }

    const currentQ = questions[currentQuestionIndex];

    return (
      <div className="app-container">
        <div className="card secure-test-area" style={{ maxWidth: '600px' }}>
          <div className="assessment-header">
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
              <span style={{ color: '#a1a1aa' }}>Question {currentQuestionIndex + 1} of {questions.length}</span>
              <div className={`timer-box ${timeLeft < 300 ? 'timer-warning' : ''}`}>
                <Clock size={16} />
                <span>Time Left: {formatTime(timeLeft)}</span>
              </div>
            </div>
            <span style={{ color: '#6366f1', fontWeight: 'bold' }}>MCQ Assessment</span>
          </div>

          <h3 style={{ color: '#fff', fontSize: '1.25rem', marginBottom: '2rem', lineHeight: '1.4' }}>{currentQ?.text}</h3>

          <div className="options-grid">
            {currentQ?.options.map((opt, idx) => (
              <button
                key={idx}
                onClick={() => setUserAnswers({ ...userAnswers, [currentQuestionIndex]: idx })}
                className={`option-btn ${userAnswers[currentQuestionIndex] === idx ? 'selected' : ''}`}
              >
                <div className="radio-circle">
                  {String.fromCharCode(65 + idx)}
                </div>
                {opt}
              </button>
            ))}
          </div>

          <div className="nav-btns">
            <button
              disabled={currentQuestionIndex === 0}
              onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
              className="btn"
              style={{ background: 'transparent', color: '#a1a1aa', border: '1px solid #3f3f46' }}
            >
              Previous
            </button>
            {currentQuestionIndex === questions.length - 1 ? (
              <button 
                onClick={handleTestSubmit} 
                disabled={loading || userAnswers[currentQuestionIndex] === undefined} 
                className="btn btn-primary"
              >
                {loading ? <Loader2 className="btn-spinner" /> : 'Submit Test'}
              </button>
            ) : (
              <button
                onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                disabled={userAnswers[currentQuestionIndex] === undefined}
                className="btn btn-primary"
              >
                Next Question
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- Admin UI ---
  if (view === 'admin') {
    return (
      <div className="app-container">
        <div className="card" style={{ maxWidth: '1100px', width: '95%', margin: '2rem auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', borderBottom: '1px solid #27272a', paddingBottom: '1.5rem' }}>
            <div>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '1.75rem' }}>Admin Control Center</h2>
              <p style={{ color: '#71717a', fontSize: '0.85rem', marginTop: '0.25rem' }}>Manage assessment and view candidate results</p>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div style={{ background: 'rgba(99, 102, 241, 0.1)', padding: '0.5rem 1rem', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                <span style={{ color: '#818cf8', fontWeight: 'bold', fontSize: '1.1rem' }}>{questions.length}</span>
                <span style={{ color: '#a1a1aa', fontSize: '0.75rem', marginLeft: '0.5rem' }}>TOTAL QUESTIONS</span>
              </div>
              <button onClick={handleLogOut} className="btn" style={{ background: '#ef4444', color: '#fff', width: 'auto' }}>
                <LogOut size={16} /> Logout
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '2.5rem' }}>
            {/* Left Column: Manage Questions */}
            <div>
              <form onSubmit={handleAddQuestion} className="admin-form" style={{ position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ color: '#fff', margin: 0 }}>Add Question {questions.length + 1}</h3>
                  {lastAddedIndex && (
                    <div className="fade-in" style={{ 
                      color: '#4ade80', 
                      fontSize: '0.85rem', 
                      background: 'rgba(74, 222, 128, 0.15)', 
                      padding: '0.5rem 1rem', 
                      borderRadius: '8px',
                      border: '1px solid rgba(74, 222, 128, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <CheckCircle size={14} />
                      <span>Question {lastAddedIndex} Saved! You can now set Question {lastAddedIndex + 1}.</span>
                    </div>
                  )}
                </div>
                
                {error && (
                  <div className="error-box" style={{ marginBottom: '1rem' }}>
                    <span className="error-dot" />
                    {error}
                  </div>
                )}
                
                <div className="field">
                  <label className="field-label">Question Text</label>
                  <textarea
                    className="input"
                    value={newQuestion.text}
                    onChange={e => setNewQuestion({...newQuestion, text: e.target.value})}
                    placeholder="Enter the question here..."
                    required
                  />
                </div>
                <div className="options-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem', margin: '1rem 0' }}>
                  {(newQuestion.options || ['', '', '', '']).map((opt, idx) => (
                    <div key={idx} className="field">
                      <label className="field-label">Option {String.fromCharCode(65 + idx)}</label>
                      <input
                        type="text"
                        className="input"
                        value={opt}
                        onChange={e => {
                          const newOpts = [...newQuestion.options];
                          newOpts[idx] = e.target.value;
                          setNewQuestion({...newQuestion, options: newOpts});
                        }}
                        required
                      />
                    </div>
                  ))}
                </div>
                <div className="field" style={{ marginBottom: '1.5rem' }}>
                  <label className="field-label">Which is the Correct Option?</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {[0, 1, 2, 3].map(i => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setNewQuestion({...newQuestion, correctAnswer: i})}
                        style={{
                          flex: 1,
                          padding: '0.75rem',
                          borderRadius: '8px',
                          border: '1px solid',
                          borderColor: newQuestion.correctAnswer === i ? '#6366f1' : '#3f3f46',
                          background: newQuestion.correctAnswer === i ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                          color: newQuestion.correctAnswer === i ? '#818cf8' : '#a1a1aa',
                          cursor: 'pointer',
                          fontWeight: 'bold'
                        }}
                      >
                        Option {String.fromCharCode(65 + i)}
                      </button>
                    ))}
                  </div>
                </div>
                <button type="submit" disabled={loading} className="btn btn-primary" style={{ padding: '1rem' }}>
                  {loading ? <Loader2 size={20} className="btn-spinner" /> : 'Save Question & Continue'}
                </button>
              </form>

              <div className="questions-list">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ color: '#fff', margin: 0 }}>Saved Questions ({questions.length})</h3>
                  <button onClick={fetchQuestions} className="btn" style={{ width: 'auto', background: '#27272a', color: '#fff', padding: '0.4rem 1rem', fontSize: '0.75rem' }}>Refresh List</button>
                </div>
                <div style={{ display: 'grid', gap: '1rem', maxHeight: '500px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                  {questions.length === 0 ? (
                    <p style={{ color: '#71717a', textAlign: 'center', padding: '2rem' }}>No questions saved yet.</p>
                  ) : (
                    questions.map((q, idx) => (
                      <div key={q.id} className="question-item" style={{ padding: '1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                          <p style={{ color: '#fff', margin: 0, fontWeight: '500', fontSize: '1rem' }}>{questions.length - idx}. {q.text}</p>
                          <button onClick={() => handleDeleteQuestion(q.id)} style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}>Delete</button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1rem' }}>
                          {q.options.map((opt, i) => (
                            <div key={i} style={{ 
                              color: i === q.correctAnswer ? '#4ade80' : '#71717a', 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '8px',
                              background: i === q.correctAnswer ? 'rgba(74, 222, 128, 0.05)' : 'transparent',
                              padding: '0.4rem',
                              borderRadius: '6px',
                              border: i === q.correctAnswer ? '1px solid rgba(74, 222, 128, 0.1)' : '1px solid transparent'
                            }}>
                              <span style={{ fontWeight: 'bold' }}>{String.fromCharCode(65 + i)}:</span> 
                              <span>{opt}</span>
                              {i === q.correctAnswer && <CheckCircle size={14} />}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Test Results */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ color: '#fff', margin: 0 }}>Candidate Submissions</h3>
                <button onClick={fetchSubmissions} className="btn" style={{ width: 'auto', background: '#27272a', color: '#fff', padding: '0.4rem 1rem', fontSize: '0.75rem' }}>Refresh</button>
              </div>
              <div style={{ display: 'grid', gap: '1rem', maxHeight: '900px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                {submissions.length === 0 ? (
                  <p style={{ color: '#71717a', textAlign: 'center', padding: '2rem' }}>Waiting for submissions...</p>
                ) : (
                  submissions.map((sub) => (
                    <div key={sub.id} className="info-card" style={{ margin: 0, borderLeft: '4px solid #6366f1' }}>
                      <div className="info-card-header" style={{ border: 'none', marginBottom: '0.5rem' }}>
                        <div className="status-dot" style={{ backgroundColor: '#6366f1' }} />
                        <span className="info-card-label" style={{ fontSize: '0.9rem', color: '#fff' }}>{sub.username}</span>
                        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                           <span style={{ display: 'block', fontSize: '0.65rem', color: '#52525b' }}>
                            {sub.timestamp?.toDate().toLocaleDateString()}
                          </span>
                           <span style={{ display: 'block', fontSize: '0.65rem', color: '#52525b' }}>
                            {sub.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                      <div className="info-rows" style={{ gap: '0.4rem', marginTop: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                          <div>
                            <span style={{ display: 'block', fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Test Score</span>
                            <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>{sub.score} <span style={{ fontSize: '0.9rem', color: '#52525b', fontWeight: 'normal' }}>/ {sub.totalQuestions}</span></span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ display: 'block', fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Performance</span>
                            <span style={{ fontSize: '1.1rem', fontWeight: '600', color: '#fff' }}>{( (sub.score / sub.totalQuestions) * 100 ).toFixed(0)}%</span>
                          </div>
                        </div>
                        <div style={{ height: '4px', background: '#27272a', borderRadius: '2px', marginTop: '0.5rem', overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: '#10b981', width: `${(sub.score / sub.totalQuestions) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="bg-decoration" aria-hidden="true">
        <div className="blob blob-top-left" />
        <div className="blob blob-bottom-right" />
      </div>

      <div className="card">
        {/* Header section */}
        <div className="card-header">
          <div className="logo-icon">
            <Code2 size={28} color="#d4d4d8" />
          </div>
          <h1 className="brand-name">Skyhigh Security</h1>
          <p className="brand-subtitle">Candidate Assessment Platform</p>
        </div>

        {/* --- "NEW PAGE" (Success View) --- */}
        {view === 'success' && (
          <div className="dashboard fade-in">
            <div className="success-icon-wrap">
              <CheckCircle size={44} className="success-icon" />
            </div>

            <h2 className="welcome-title" style={{ fontSize: '1.2rem', fontWeight: '500', lineHeight: '1.5' }}>
              {statusMessage}
            </h2>

            <div style={{ marginTop: '2rem' }}>
              <button
                onClick={() => setView('login')}
                className="btn btn-primary"
              >
                Go to Login
              </button>
            </div>
          </div>
        )}

        {/* --- AUTH VIEWS --- */}
        {(view === 'login' || view === 'signup') && (
          <div className="auth-section fade-in">
            <div className="tabs">
              <button
                className={`tab ${view === 'login' ? 'tab-active' : ''}`}
                onClick={() => { setView('login'); setError(''); }}
              >
                Log In
              </button>
              <button
                className={`tab ${view === 'signup' ? 'tab-active' : ''}`}
                onClick={() => { setView('signup'); setError(''); }}
              >
                Register
              </button>
            </div>

            {error && (
              <div className="error-box">
                <span className="error-dot" />
                {error}
              </div>
            )}

            <form onSubmit={view === 'login' ? handleSignIn : handleSignUp} className="form">
              {view === 'signup' && (
                <div className="field">
                  <label className="field-label">Full Name</label>
                  <div className="input-wrap">
                    <User size={16} className="input-icon" />
                    <input
                      type="text"
                      placeholder="John Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="input"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="field">
                <label className="field-label">Username / User ID</label>
                <div className="input-wrap">
                  <UserCircle size={16} className="input-icon" />
                  <input
                    type="text"
                    placeholder="Enter Username"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    className="input"
                    required
                  />
                </div>
              </div>

              <div className="field">
                <label className="field-label">Password</label>
                <div className="input-wrap">
                  <Lock size={16} className="input-icon" />
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input"
                    required
                  />
                </div>
              </div>

              <button type="submit" disabled={loading} className="btn btn-primary btn-submit" style={{ marginTop: '1rem' }}>
                {loading ? (
                  <Loader2 size={18} className="btn-spinner" />
                ) : (
                  view === 'login' ? 'Start Assignment' : 'Register for Test'
                )}
              </button>
            </form>

            <div style={{ marginTop: '2rem', textAlign: 'center' }}>
              <p style={{ color: '#71717a', fontSize: '0.8rem' }}>
                Admin? Use credentials to login to panel.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
