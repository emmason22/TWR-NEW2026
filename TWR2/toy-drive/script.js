// ============================================
// Mobile Menu Toggle
// ============================================

const menuToggle = document.getElementById('menuToggle');
const navLinks = document.getElementById('navLinks');

if (menuToggle && navLinks) {
menuToggle.addEventListener('click', () => {
const isOpen = navLinks.classList.toggle('active');   // shows/hides links
menuToggle.classList.toggle('active');                // animates burger → X

```
    // Update aria-expanded for accessibility
    menuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
});

// Close menu when a link is clicked
document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => {
        navLinks.classList.remove('active');
        menuToggle.classList.remove('active');
        menuToggle.setAttribute('aria-expanded', 'false');
    });
});
```

}

// ============================================
// Scroll Effects
// ============================================

// Navbar shadow on scroll (simple inline style)
window.addEventListener('scroll', () => {
const navbar = document.querySelector('.navbar');
if (!navbar) return;

```
if (window.scrollY > 100) {
    navbar.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.4)';
} else {
    navbar.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.2)';
}
```

});

// ============================================
// Smooth Scroll for Navigation
// ============================================

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
anchor.addEventListener('click', function (e) {
const href = this.getAttribute('href');
// allow e.g. href="#" to behave normally
if (!href || href === '#') return;

```
    e.preventDefault();
    const target = document.querySelector(href);
    if (target) {
        target.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }
});
```

});

// ============================================
// Ripple Effect for .btn-large (if used)
// ============================================

document.querySelectorAll('.btn-large').forEach(btn => {
btn.addEventListener('click', (e) => {
const ripple = document.createElement('span');
ripple.style.position = 'absolute';
ripple.style.width = '20px';
ripple.style.height = '20px';
ripple.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
ripple.style.borderRadius = '50%';
ripple.style.pointerEvents = 'none';
ripple.style.transform = 'scale(0)';
ripple.style.transition = 'transform 0.4s ease, opacity 0.4s ease';

```
    const rect = btn.getBoundingClientRect();
    ripple.style.left = (e.clientX - rect.left - 10) + 'px';
    ripple.style.top = (e.clientY - rect.top - 10) + 'px';

    btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(ripple);

    // trigger animation
    requestAnimationFrame(() => {
        ripple.style.transform = 'scale(6)';
        ripple.style.opacity = '0';
    });

    // Remove ripple after animation
    setTimeout(() => ripple.remove(), 600);
});
```

});

// ============================================
// Print Styles
// ============================================

const style = document.createElement('style');
style.textContent = `    @media print {
        .navbar, .menu-toggle {
            display: none !important;
        }
        body {
            font-size: 12pt;
            background: #ffffff !important;
            color: #000000 !important;
        }
        .hero {
            page-break-after: always;
        }
    }`;
document.head.appendChild(style);

// ============================================
// Document Ready Check
// ============================================

console.log('🎸 Tonight We Ride - Website loaded successfully!');
console.log('Year 26 - Great Music for a Great Cause');
