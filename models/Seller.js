const mongoose = require('mongoose');
const { Schema, model } = mongoose;
const { createHmac, randomBytes } = require('crypto');
const { creatTokenForUser } = require('../services/authentication');

const SellerSchema = new Schema({
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: false
  },
  salt: { type: String },
  profileImageURL: {
    type: String,
    default: '/imgs/default.png'
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  role: {
    type: String,
    enum: ['SELLER', 'ADMIN'],
    default: 'SELLER'
  },

  // Business Details
  businessName: { type: String, trim: true, default: '' },
  businessAddress: { type: String, trim: true, default: '' },
  phoneNumber: { type: String, trim: true, default: '' },
  gstNumber: { type: String, trim: true, default: '' },
  panNumber: { type: String, trim: true, default: '' },
  bankAccountNumber: { type: String, trim: true, default: '' },
  ifscCode: { type: String, trim: true, default: '' },
  documents: [{ type: String, default: [] }],

  // Verification
  verificationStatus: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Suspended'],
    default: 'Pending'
  },
  isGoogleUser: { type: Boolean, default: false },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'Seller', default: null },
  approvedAt: { type: Date, default: null },
  rejectedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: '' },

  // Stats (auto-updated)
  totalIncome: { type: Number, default: 0 },
  totalProducts: { type: Number, default: 0 },
  totalOrders: { type: Number, default: 0 },
  totalCustomers: { type: Number, default: 0 },
  rating: { type: Number, default: 0 },

  // Soft delete
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date }

}, { timestamps: true });

SellerSchema.index({ email: 1 });
SellerSchema.index({ verificationStatus: 1 });
SellerSchema.index({ googleId: 1 });
SellerSchema.index({ createdAt: -1 });

// Password hashing
SellerSchema.pre('save', async function (next) {
  if (!this.password || !this.isModified('password')) return next();
  try {
    const salt = randomBytes(16).toString('hex');
    this.salt = salt;
    this.password = createHmac('sha256', salt).update(this.password).digest('hex');
    next();
  } catch (error) {
    next(error);
  }
});

// Match password and generate token
SellerSchema.static('matchPassword', async function (email, password) {
  const seller = await this.findOne({ email: email.toLowerCase() });
  if (!seller) throw new Error('Seller not found');
  if (!seller.password) throw new Error('This account uses Google Sign-In. Please use Google login.');

  const sellerProvidedHash = createHmac('sha256', seller.salt).update(password).digest('hex');
  if (seller.password !== sellerProvidedHash) throw new Error('Incorrect Password');

  return creatTokenForUser(seller);
});

// Google OAuth
SellerSchema.static('findOrCreateGoogleSeller', async function (profile) {
  try {
    const email = profile.emails && profile.emails[0] ? profile.emails[0].value.toLowerCase() : null;
    if (!email) throw new Error('No email provided by Google');

    const googleId = profile.id;
    let seller = await this.findOne({ googleId });

    if (!seller) {
      seller = await this.findOne({ email });
      if (seller) {
        seller.googleId = googleId;
        if (profile.photos && profile.photos[0] && profile.photos[0].value) {
          seller.profileImageURL = profile.photos[0].value;
        }
        await seller.save();
      } else {
        seller = await this.create({
          fullName: profile.displayName || 'Google User',
          email: email,
          googleId: googleId,
          profileImageURL: (profile.photos && profile.photos[0] && profile.photos[0].value)
            ? profile.photos[0].value
            : '/imgs/default.png',
          verificationStatus: 'Approved',
          isGoogleUser: true
        });
      }
    }
    return seller;
  } catch (error) {
    console.error('❌ findOrCreateGoogleSeller Error:', error.message);
    throw error;
  }
});

const Seller = mongoose.models.Seller || model('Seller', SellerSchema);
module.exports = Seller;
