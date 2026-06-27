require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const flash = require('connect-flash');
const cookieParser = require('cookie-parser');
const path = require('path');
const methodOverride = require('method-override');
const rateLimit = require('express-rate-limit');
const passport = require('passport');
const multer = require('multer');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');

// Try to load node-cron
let cron = null;
try {
  cron = require('node-cron');
  console.log('✅ node-cron loaded');
} catch (err) {
  console.warn('⚠️ node-cron not installed');
}

// Try to load release funds job
let releaseFundsJob = null;
try {
  const releaseModule = require('./jobs/releaseFunds');
  releaseFundsJob = releaseModule.releaseFundsJob;
  console.log('✅ Release funds job loaded');
} catch (err) {
  console.warn('⚠️ Release funds job not available');
}

const app = express();
const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════════════
// SECURITY MIDDLEWARE
// ═══════════════════════════════════════════════════
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS || 'http://localhost:3000',
  credentials: true
}));

// ═══════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// ═══════════════════════════════════════════════════
// DATABASE CONNECTION
// ═══════════════════════════════════════════════════
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/shopp123')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => {
    console.error('❌ MongoDB Error:', err);
    process.exit(1);
  });

// ═══════════════════════════════════════════════════
// VIEW ENGINE
// ═══════════════════════════════════════════════════
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ═══════════════════════════════════════════════════
// STATIC FILES
// ═══════════════════════════════════════════════════
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ═══════════════════════════════════════════════════
// BODY PARSING
// ═══════════════════════════════════════════════════
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(methodOverride('_method'));

// ═══════════════════════════════════════════════════
// SESSION
// ═══════════════════════════════════════════════════
app.use(session({
  secret: process.env.SESSION_SECRET || 'shopp123-super-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
}));

// ═══════════════════════════════════════════════════
// PASSPORT
// ═══════════════════════════════════════════════════
app.use(passport.initialize());

// ═══════════════════════════════════════════════════
// FLASH MESSAGES
// ═══════════════════════════════════════════════════
app.use(flash());

// ═══════════════════════════════════════════════════
// JWT AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════
app.use((req, res, next) => {
  const { verifyToken } = require('./services/authentication');
  const token = req.cookies['token'];

  if (!token) {
    req.seller = null;
    req.admin = null;
    return next();
  }

  try {
    const decoded = verifyToken(token);
    if (decoded) {
      req.seller = decoded;
      if (decoded.role && ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(decoded.role)) {
        req.admin = decoded;
      }
    }
  } catch (error) {
    req.seller = null;
    req.admin = null;
  }
  next();
});

// ═══════════════════════════════════════════════════
// GLOBAL VARIABLES & LOCALS
// ═══════════════════════════════════════════════════
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success');
  res.locals.error_msg = req.flash('error');
  res.locals.warning_msg = req.flash('warning');
  res.locals.messages = {
    success: req.flash('success'),
    error: req.flash('error'),
    warning: req.flash('warning')
  };
  res.locals.user = req.user || req.session.user || null;
  res.locals.seller = req.seller || null;
  res.locals.admin = req.admin || req.session.admin || null;
  res.locals.currentPath = req.path;
  next();
});

// ═══════════════════════════════════════════════════
// GLOBAL EJS HELPERS
// ═══════════════════════════════════════════════════
app.locals.truncate = function(text, length = 60) {
  if (!text) return '';
  text = String(text);
  if (text.length <= length) return text;
  return text.substring(0, length).trim() + '...';
};

app.locals.formatDate = function(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
};

app.locals.formatCurrency = function(amount) {
  if (amount === undefined || amount === null) return '₹0';
  return '₹' + Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 });
};

app.locals.getStatusBadge = function(status) {
  const badges = {
    'pending': 'badge-warning',
    'confirmed': 'badge-info',
    'processing': 'badge-primary',
    'shipped': 'badge-primary',
    'out_for_delivery': 'badge-info',
    'delivered': 'badge-success',
    'cancelled': 'badge-danger',
    'returned': 'badge-secondary',
    'refunded': 'badge-secondary',
    'Pending': 'badge-warning',
    'Approved': 'badge-success',
    'Rejected': 'badge-danger',
    'Suspended': 'badge-danger'
  };
  return badges[status] || 'badge-secondary';
};

// ═══════════════════════════════════════════════════
// MULTER CONFIGURATION
// ═══════════════════════════════════════════════════
const uploadDirs = [
  'uploads/products/thumbnails',
  'uploads/products/images',
  'uploads/products/videos',
  'uploads/products/sizecharts',
  'uploads/sellers/logos',
  'uploads/sellers/documents',
  'uploads/delivery/proofs'
];

uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dirMap = {
      thumbnail: 'uploads/products/thumbnails/',
      images: 'uploads/products/images/',
      video: 'uploads/products/videos/',
      sizeChartImage: 'uploads/products/sizecharts/',
      businessLogo: 'uploads/sellers/logos/',
      document: 'uploads/sellers/documents/',
      proof: 'uploads/delivery/proofs/'
    };
    cb(null, dirMap[file.fieldname] || 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedImages = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  const allowedVideos = ['video/mp4', 'video/webm', 'video/ogg'];

  if (['thumbnail', 'images', 'sizeChartImage', 'businessLogo', 'proof'].includes(file.fieldname)) {
    cb(null, allowedImages.includes(file.mimetype));
  } else if (file.fieldname === 'video') {
    cb(null, allowedVideos.includes(file.mimetype));
  } else {
    cb(null, true);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }
});

app.locals.upload = upload;

// ═══════════════════════════════════════════════════
// ROUTE LOADING
// ═══════════════════════════════════════════════════

function safeRequire(routePath, mountPath) {
  try {
    const route = require(routePath);
    app.use(mountPath, route);
    console.log(`✅ Route loaded: ${mountPath}`);
  } catch (err) {
    console.warn(`⚠️ Route skipped: ${routePath} — ${err.message}`);
  }
}

// Seller Routes
safeRequire('./routes/SellerGoogleAuth', '/seller');
safeRequire('./routes/Seller', '/seller');
safeRequire('./routes/earnings', '/seller/earnings');
safeRequire('./routes/settings', '/seller/settings');
safeRequire('./routes/product', '/seller/products');
safeRequire('./routes/sellerOrders', '/seller/orders');

// Admin Routes
safeRequire('./routes/Admin', '/admin');
safeRequire('./routes/adminDashboard', '/admin/dashboard');
safeRequire('./routes/adminSellers', '/admin/sellers');
safeRequire('./routes/adminOrders', '/admin/orders');
safeRequire('./routes/adminDelivery', '/admin/delivery');

// Delivery Boy Routes
safeRequire('./routes/deliveryBoy', '/delivery');
safeRequire('./routes/deliveryOrders', '/delivery/orders');

// Customer Routes
safeRequire('./routes/customerOrder', '/orders');

// ═══════════════════════════════════════════════════
// HOME / LANDING PAGE
// ═══════════════════════════════════════════════════
app.get('/', (req, res) => {
  res.render('home', {
    title: 'Shopp123 - Seller Dashboard',
    seller: req.seller || null,
    admin: req.admin || null
  });
});

// ═══════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ═══════════════════════════════════════════════════
// CRON JOB: RELEASE FUNDS
// ═══════════════════════════════════════════════════
if (cron && releaseFundsJob) {
  cron.schedule('0 0 * * *', () => {
    console.log('⏰ Running daily funds release job...');
    releaseFundsJob().catch(err => {
      console.error('❌ Funds release job failed:', err.message);
    });
  });
  console.log('✅ Daily funds release cron scheduled (midnight)');
}

// ═══════════════════════════════════════════════════
// ERROR HANDLING MIDDLEWARE
// ═══════════════════════════════════════════════════
app.use((err, req, res, next) => {
  console.error('🚨 Error:', err);

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      req.flash('error', 'File size too large. Max 50MB allowed.');
    } else {
      req.flash('error', 'File upload error: ' + err.message);
    }
    return res.redirect('back');
  }

  const statusCode = err.status || err.statusCode || 500;
  const errorMessage = process.env.NODE_ENV === 'production'
    ? 'Something went wrong!'
    : (err.message || 'An unexpected error occurred');

  if (req.accepts('json')) {
    return res.status(statusCode).json({
      success: false,
      message: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { error: err })
    });
  }

  res.status(statusCode).render('error', {
    title: 'Error',
    message: errorMessage
  });
});

// ═══════════════════════════════════════════════════
// 404 HANDLER
// ═══════════════════════════════════════════════════
app.use((req, res) => {
  res.status(404).render('404', {
    title: 'Page Not Found',
    message: 'The page you are looking for does not exist.'
  });
});

// ═══════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
