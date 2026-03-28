// DOM Elements
const hamburger = document.querySelector('.hamburger');
const navLinks = document.querySelector('.nav-links');

// Hamburger Menu Toggle
if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
        navLinks.classList.toggle('active');
    });
}

// Rest of your script (Firebase, modal, etc.)
const watchAdsBtns = document.querySelectorAll('.watch-ads-btn');
const modal = document.getElementById('keyModal');
const closeBtn = document.querySelector('.close');
const copyKeyBtn = document.getElementById('copyKey');
const generatedKeyDisplay = document.getElementById('generatedKey');

// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-analytics.js";

// Your Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyCIaeNa81nbHhBNyJeBG_IWR-LhJNUjRvg",
  authDomain: "halurea1.firebaseapp.com",
  databaseURL: "https://halurea1.firebaseio.com",
  projectId: "halurea1",
  storageBucket: "halurea1.firebasestorage.app",
  messagingSenderId: "216574232987",
  appId: "1:216574232987:web:fd4968243045e25505f93e",
  measurementId: "G-GS3ZZYM5KH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const analytics = getAnalytics(app);

// Show Modal with Key
function showKeyModal(key) {
  if (generatedKeyDisplay) {
    generatedKeyDisplay.textContent = key;
    modal.style.display = 'block';
  }
}

// Copy Key to Clipboard
if (copyKeyBtn) {
  copyKeyBtn.addEventListener('click', () => {
    const key = generatedKeyDisplay.textContent;
    navigator.clipboard.writeText(key).then(() => {
      alert('Key copied to clipboard!');
    });
  });
}

// Close Modal
if (closeBtn) {
  closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });
}

// Close Modal if clicked outside
window.addEventListener('click', (e) => {
  if (e.target === modal) {
    modal.style.display = 'none';
  }
});

// Generate Random Key
function generateKey(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$&-+/?!*';
  let key = '';
  for (let i = 0; i < length; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

// Watch Ads Button Logic
if (watchAdsBtns) {
  watchAdsBtns.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const card = e.target.closest('.card');
      const adsRequired = parseInt(card.dataset.adsRequired);
      const validity = parseInt(card.dataset.validity);
      const progressText = card.querySelector('.progress-text');
      const progressBar = card.querySelector('.progress-bar');
      const blurredKey = card.querySelector('.blurred-key');

      let adsWatched = parseInt(progressText.textContent.split('/')[0]);

      if (adsWatched < adsRequired) {
        adsWatched++;
        progressText.textContent = `${adsWatched}/${adsRequired}`;
        progressBar.style.width = `${(adsWatched / adsRequired) * 100}%`;

        if (adsWatched >= adsRequired) {
          btn.disabled = true;
          try {
            const key = generateKey();
            const expiryTime = Date.now() + validity * 60 * 1000;
            const userId = `user_${Math.random().toString(36).substr(2, 9)}`;

            await set(ref(db, `keys/${userId}`), {
              key,
              expiry: expiryTime,
              used: false
            });

            blurredKey.textContent = key;
            blurredKey.style.filter = 'none';
            showKeyModal(key);

            setTimeout(() => {
              progressText.textContent = `0/${adsRequired}`;
              progressBar.style.width = '0%';
              btn.disabled = false;
            }, 3000);
          } catch (error) {
            alert('Failed to generate key. Please try again.');
            console.error('Error:', error);
            btn.disabled = false;
          }
        }
      }
    });
  });
}

// Initialize Progress for Each Card
document.querySelectorAll('.card')?.forEach(card => {
  const progressText = card.querySelector('.progress-text');
  const adsRequired = card.dataset.adsRequired;
  progressText.textContent = `0/${adsRequired}`;
});
