// graphql/resolvers.js

const User = require("../models/User");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const Admin = require("../models/Admin");
const Subject = require("../models/Subject");
const Transaction = require("../models/Transaction");
const Message = require("../models/Message");
const Rating = require("../models/rating");
const VideoProgress = require("../models/VideoProgress");
const PDFProgress = require("../models/PDFProgress");

const {
  requireAuth,
  requireRole,
  generateToken,
} = require("../Middleware/auth");
const { calculateSplit, eurosToPoints } = require("../utils/helpers");
const {
  isValidEmail,
  isValidPassword,
  hasSufficientCredit,
  isValidRating,
  isValidComment,
} = require("../utils/validators");

// Utilitaires pour l'envoi d'email (à créer)

const crypto = require('crypto');

const {
  sendVerificationEmail,
  generateVerificationCode
} = require('../utils/email');

const dashboardResolvers = require('./dashboardResolvers');
const studentAnalyticsResolvers = require('./studentAnalyticsResolvers');
const memoryResolvers = require('./memoryResolvers');

const resolvers = {
  Query: {
    // ========================================
    // AUTH
    // ========================================
    me: async (_, __, context) => {
      requireAuth(context);
      return context.user;
    },

    myProfile: async (_, __, context) => {
      requireAuth(context);
      const user = await User.findById(context.user._id)
        .populate("studentProfile")
        .populate("teacherProfile")
        .populate("adminProfile");

      if (user.role === "STUDENT" && user.studentProfile) {
        return await Student.findById(user.studentProfile).populate(
          "enrolledSubjects",
        );
      } else if (user.role === "TEACHER" && user.teacherProfile) {
        return await Teacher.findById(user.teacherProfile).populate(
          "selectedSubjects",
        );
      } else if (
        (user.role === "ADMIN" || user.role === "SUPER_ADMIN") &&
        user.adminProfile
      ) {
        return await Admin.findById(user.adminProfile);
      }
      return null;
    },

    // ========================================
    // USERS
    // ========================================
    users: async (_, { role, status }, context) => {
      requireRole(context, ["ADMIN", "SUPER_ADMIN"]);
      const filter = {};
      if (role) filter.role = role;
      if (status) filter.status = status;
      return await User.find(filter).sort({ createdAt: -1 });
    },

    user: async (_, { id }, context) => {
      requireRole(context, ["ADMIN", "SUPER_ADMIN"]);
      return await User.findById(id);
    },

    // ========================================
    // STUDENTS
    // ========================================
    students: async (_, __, context) => {
      requireRole(context, ["ADMIN", "SUPER_ADMIN"]);
      return await Student.find().populate({
        path: "enrolledSubjects",
        populate: {
          path: "assignedTeachers.teacherId assignedTeachers.userId",
        },
      });
    },

    student: async (_, { id }, context) => {
      requireRole(context, ["ADMIN", "SUPER_ADMIN"]);
      return await Student.findById(id).populate({
        path: "enrolledSubjects",
        populate: {
          path: "assignedTeachers.teacherId assignedTeachers.userId",
        },
      });
    },

    // ========================================
    // TEACHERS
    // ========================================
    teachers: async (_, __, context) => {
      requireRole(context, ["ADMIN", "SUPER_ADMIN"]);
      return await Teacher.find().populate({
        path: "selectedSubjects",
        populate: {
          path: "enrolledStudents.studentId enrolledStudents.userId",
        },
      });
    },

    teacher: async (_, { id }, context) => {
      requireRole(context, ["ADMIN", "SUPER_ADMIN"]);
      return await Teacher.findById(id).populate({
        path: "selectedSubjects",
        populate: {
          path: "enrolledStudents.studentId enrolledStudents.userId",
        },
      });
    },

    // ========================================
    // ADMINS
    // ========================================
    admins: async (_, __, context) => {
      requireRole(context, ["SUPER_ADMIN"]);
      return await Admin.find();
    },

    admin: async (_, { id }, context) => {
      requireRole(context, ["SUPER_ADMIN"]);
      return await Admin.findById(id);
    },

    // ... (toutes les autres queries restent identiques)
    // Continuer avec subjects, mySubjects, myPurchasedSubjects, myProgress, etc.
    // ========================================
    // SUBJECTS
    // ========================================
    subjects: async (_, { teacherId, level, status }, context) => {
      const filter = {};

      // Si un niveau est fourni explicitement, on l'utilise
      if (level) {
        filter.level = level;
      }
      // Sinon, si c'est un étudiant connecté, on filtre par son niveau et son année par défaut
      else if (context && context.user && context.user.role === "STUDENT") {
        const student = await Student.findOne({ userId: context.user._id });
        if (student) {
          let targetLevel = student.educationLevel;
          if (targetLevel === "CEM") targetLevel = "CEM";
          filter.level = targetLevel;
        }
      }

      if (status) filter.status = status;
      else filter.status = "ACTIVE";

      return await Subject.find(filter).sort({ createdAt: -1 });
    },

    subject: async (_, { id }) => {
      return await Subject.findById(id);
    },
    mySubjects: async (_, __, context) => {
      requireAuth(context);

      // ========================================
      // CAS TEACHER → DOIT ÊTRE EN PREMIER
      // ========================================
      if (context.user.role === 'TEACHER') {
        const teacher = await Teacher.findOne({ userId: context.user._id });
        if (!teacher) {
          return {
            hasEnrolled: false,
            enrolledSubjects: [],
            availableSubjects: [],
            studentLevel: null
          };
        }

        const subjects = await Subject.find({
          'assignedTeachers.teacherId': teacher._id,
          status: 'ACTIVE'
        }).sort({ createdAt: -1 });

        return {
          hasEnrolled: subjects.length > 0,
          enrolledSubjects: subjects,
          availableSubjects: [],
          studentLevel: null
        };
      }

      // ========================================
      // CAS STUDENT → APRÈS le check TEACHER
      // ========================================
      const levelMap = {
        'PRIMAIRE': 'PRIMAIRE',
        'CEM': 'CEM',
        'LYCEE': 'LYCEE',
        'SUPERIEUR': 'SUPERIEUR'
      };

      const student = await Student.findOne({ userId: context.user._id });
      if (!student) {
        return {
          hasEnrolled: false,
          enrolledSubjects: [],
          availableSubjects: [],
          studentLevel: null
        };
      }

      if (student.enrolledSubjects && student.enrolledSubjects.length > 0) {
        const enrolled = await Subject.find({
          _id: { $in: student.enrolledSubjects }
        });
        return {
          hasEnrolled: true,
          enrolledSubjects: enrolled,
          availableSubjects: [],
          studentLevel: student.educationLevel
        };
      }

      const mappedLevel = levelMap[student.educationLevel];

      const filter = { level: mappedLevel, status: 'ACTIVE' };

      const available = await Subject.find(filter).sort({ createdAt: -1 });

      return {
        hasEnrolled: false,
        enrolledSubjects: [],
        availableSubjects: available,
        studentLevel: student.educationLevel
      };
    },
    myPurchasedSubjects: async (_, __, context) => {
      requireAuth(context);
      if (context.user.role !== "STUDENT") {
        return [];
      }
      const student = await Student.findOne({
        userId: context.user._id,
      }).populate({
        path: "enrolledSubjects",
        populate: {
          path: "assignedTeachers.teacherId assignedTeachers.userId",
        },
      });
      return student?.enrolledSubjects || [];
    },

    myProgress: async (_, __, context) => {
      requireRole(context, ["STUDENT"]);

      const student = await Student.findOne({ userId: context.user._id });
      if (!student) {
        throw new Error("Profil étudiant non trouvé");
      }

      const subjects = await Subject.find({
        _id: { $in: student.enrolledSubjects },
      });

      const progressData = [];

      for (const subject of subjects) {
        const videosProgress = await VideoProgress.find({
          student: student._id,
          subject: subject._id,
        });

        const pdfsProgress = await PDFProgress.find({
          student: student._id,
          subject: subject._id,
        });

        const ratings = await Rating.find({
          student: student._id,
          subject: subject._id,
        });

        const totalContent = subject.videos.length + subject.pdfs.length;
        const completedVideos = videosProgress.filter((v) => v.completed).length;
        const completedPDFs = pdfsProgress.filter((p) => p.completed).length;
        const overallProgress =
          totalContent > 0
            ? ((completedVideos + completedPDFs) / totalContent) * 100
            : 0;

        progressData.push({
          subject,
          overallProgress,
          videosProgress,
          pdfsProgress,
          ratings,
        });
      }

      return progressData;
    },

    subjectProgress: async (_, { subjectId }, context) => {
      requireRole(context, ["STUDENT"]);

      const student = await Student.findOne({ userId: context.user._id });
      const subject = await Subject.findById(subjectId);

      if (!subject) {
        throw new Error("Matière non trouvée");
      }

      if (!student.enrolledSubjects.includes(subjectId)) {
        throw new Error("Vous n'avez pas acheté cette matière");
      }

      const videosProgress = await VideoProgress.find({
        student: student._id,
        subject: subject._id,
      });

      const pdfsProgress = await PDFProgress.find({
        student: student._id,
        subject: subject._id,
      });

      const ratings = await Rating.find({
        student: student._id,
        subject: subject._id,
      });

      const totalContent = subject.videos.length + subject.pdfs.length;
      const completedVideos = videosProgress.filter((v) => v.completed).length;
      const completedPDFs = pdfsProgress.filter((p) => p.completed).length;
      const overallProgress =
        totalContent > 0
          ? ((completedVideos + completedPDFs) / totalContent) * 100
          : 0;

      return {
        subject,
        overallProgress,
        videosProgress,
        pdfsProgress,
        ratings,
      };
    },

    // ========================================
    // ÉVALUATIONS
    // ========================================
    subjectRatings: async (_, { subjectId }) => {
      return await Rating.find({
        subject: subjectId,
        targetType: "SUBJECT",
      })
        .populate("student studentUserId")
        .sort({ createdAt: -1 });
    },

    teacherRatings: async (_, { teacherId }) => {
      return await Rating.find({
        teacher: teacherId,
        targetType: "TEACHER",
      })
        .populate("student studentUserId")
        .sort({ createdAt: -1 });
    },

    myRatings: async (_, __, context) => {
      requireRole(context, ["STUDENT"]);

      const student = await Student.findOne({ userId: context.user._id });

      return await Rating.find({ student: student._id })
        .populate("subject teacher")
        .sort({ createdAt: -1 });
    },

    // ========================================
    // TRANSACTIONS
    // ========================================
    myTransactions: async (_, __, context) => {
      requireAuth(context);
      return await Transaction.find({
        $or: [{ student: context.user._id }, { teacher: context.user._id }],
      })
        .populate("student teacher subject")
        .sort({ createdAt: -1 });
    },

    userTransactions: async (_, { userId }, context) => {
      requireRole(context, ["ADMIN", "SUPER_ADMIN"]);
      return await Transaction.find({
        $or: [{ student: userId }, { teacher: userId }],
      })
        .populate("student teacher subject")
        .sort({ createdAt: -1 });
    },

    allTransactions: async (_, { type }, context) => {
      requireRole(context, ["ADMIN", "SUPER_ADMIN"]);
      const filter = type ? { type } : {};
      return await Transaction.find(filter)
        .populate("student teacher subject")
        .sort({ createdAt: -1 })
        .limit(100);
    },

    // ========================================
    // MESSAGES
    // ========================================
    myMessages: async (_, { recipientId }, context) => {
      requireAuth(context);
      const filter = recipientId
        ? {
          $or: [
            { sender: context.user._id, recipient: recipientId },
            { sender: recipientId, recipient: context.user._id },
          ],
        }
        : {
          $or: [
            { sender: context.user._id },
            { recipient: context.user._id },
          ],
        };

      return await Message.find(filter)
        .populate("sender recipient subject")
        .sort({ createdAt: -1 });
    },

    conversation: async (_, { userId }, context) => {
      requireAuth(context);
      return await Message.find({
        $or: [
          { sender: context.user._id, recipient: userId },
          { sender: userId, recipient: context.user._id },
        ],
      })
        .populate("sender recipient subject")
        .sort({ createdAt: 1 });
    },

    // ========================================
    // STATS
    // ========================================
    dashboardStats: async (_, __, context) => {
      requireRole(context, ["ADMIN", "SUPER_ADMIN"]);

      const totalStudents = await User.countDocuments({ role: "STUDENT" });
      const totalTeachers = await User.countDocuments({ role: "TEACHER" });
      const totalSubjects = await Subject.countDocuments({ status: "ACTIVE" });

      const revenueData = await Transaction.aggregate([
        { $match: { type: { $in: ["SUBJECT_BUY", "AI_USE"] } } },
        { $group: { _id: null, total: { $sum: "$companyCut" } } },
      ]);

      const totalRevenue = revenueData[0]?.total || 0;
      const totalTransactions = await Transaction.countDocuments();

      const recentTransactions = await Transaction.find()
        .populate("student teacher subject")
        .sort({ createdAt: -1 })
        .limit(10);

      return {
        totalStudents,
        totalTeachers,
        totalSubjects,
        totalRevenue,
        totalTransactions,
        recentTransactions,
      };
    },

    teacherEarnings: async (_, __, context) => {
      requireRole(context, ["TEACHER"]);

      const earnings = await Transaction.aggregate([
        { $match: { teacher: context.user._id, type: "SUBJECT_BUY" } },
        { $group: { _id: null, total: { $sum: "$teacherCut" } } },
      ]);

      return earnings[0]?.total || 0;
    },

    // ========================================
    // DASHBOARD ANALYTICS
    // ========================================
    ...dashboardResolvers.Query,
    ...studentAnalyticsResolvers.Query,
    ...memoryResolvers.Query,

    // ========================================
    // ACCÈS VIDÉO
    // ========================================
    hasAccessToVideo: async (_, { subjectId, videoId }, context) => {
      requireRole(context, ["STUDENT"]);

      const subject = await Subject.findById(subjectId);
      if (!subject) throw new Error("Matière non trouvée");

      const video = subject.videos.id(videoId);
      if (!video) throw new Error("Vidéo non trouvée");

      // Vidéo gratuite → accès libre
      if (!video.price || video.price === 0) return true;

      // Vérifier si une transaction VIDEO_WATCH existe
      const student = await Student.findOne({ userId: context.user._id });
      const existingTransaction = await Transaction.findOne({
        student: context.user._id,
        videoId: videoId,
        type: "VIDEO_WATCH",
        status: "COMPLETED",
      });

      return !!existingTransaction;
    },

    hasAccessToPDF: async (_, { subjectId, pdfId }, context) => {
      requireRole(context, ["STUDENT"]);

      const subject = await Subject.findById(subjectId);
      if (!subject) throw new Error("Matière non trouvée");

      const pdf = subject.pdfs.id(pdfId);
      if (!pdf) throw new Error("PDF non trouvé");

      // PDF gratuit → accès libre
      if (!pdf.price || pdf.price === 0) return true;

      // Vérifier si une transaction PDF_READ existe
      const existingTransaction = await Transaction.findOne({
        student: context.user._id,
        pdfId: pdfId,
        type: "PDF_READ",
        status: "COMPLETED",
      });

      return !!existingTransaction;
    },
  },

  Mutation: {
    // ========================================
    // INSCRIPTION EN 3 ÉTAPES - STUDENT
    // ========================================
    registerStudentStep1: async (_, args) => {
      try {
        const { firstName, lastName, phone, parentName, educationLevel } = args;

        // Créer un User partiel (1/3)
        const user = await User.create({
          firstName,
          lastName,
          phone,
          role: 'STUDENT',
          email: `temp_${Date.now()}@temp.com`,
          password: `temp_${Date.now()}`,
          status: 'INACTIVE',
        });

        // Créer le profil Student
        const student = await Student.create({
          userId: user._id,
          parentName,
          educationLevel,
          credit: 100,
          enrolledSubjects: []
        });

        // Lier le profil au user
        user.studentProfile = student._id;
        await user.save();

        return {
          success: true,
          message: "Informations personnelles enregistrées (1/3)",
          userId: user._id.toString(),
          step: 1
        };
      } catch (error) {
        console.error("Erreur registerStudentStep1:", error);
        throw new Error(`Erreur lors de l'enregistrement: ${error.message}`);
      }
    },

    // ========================================
    // INSCRIPTION EN 3 ÉTAPES - TEACHER
    // ========================================
    registerTeacherStep1: async (_, args) => {
      try {
        const { firstName, lastName, phone, subjects, educationLevels } = args;

        // Créer un User partiel (1/3)
        const user = await User.create({
          firstName,
          lastName,
          phone,
          role: 'TEACHER',
          email: `temp_${Date.now()}@temp.com`,
          password: `temp_${Date.now()}`,
          status: 'INACTIVE',
        });

        // Créer le profil Teacher
        const teacher = await Teacher.create({
          userId: user._id,
          subjects: subjects || [],
          educationLevels: educationLevels || [],
          selectedSubjects: [],
          credit: 0,
          totalEarnings: 0,
          withdrawable: 0
        });

        // Lier le profil au user
        user.teacherProfile = teacher._id;
        await user.save();

        return {
          success: true,
          message: "Informations personnelles enregistrées (1/3)",
          userId: user._id.toString(),
          step: 1
        };
      } catch (error) {
        console.error("Erreur registerTeacherStep1:", error);
        throw new Error(`Erreur lors de l'enregistrement: ${error.message}`);
      }
    },

    // ========================================
    // ÉTAPE 2/3: CRÉATION DU COMPTE
    // ========================================
    registerStep2: async (_, args) => {
      try {
        const { userId, email, password, confirmedPassword } = args;

        // Vérifier que l'utilisateur existe
        const user = await User.findById(userId);
        if (!user) {
          throw new Error("Utilisateur non trouvé");
        }

        // Vérifier si l'email est déjà utilisé (sauf email temporaire)
        if (!email.includes('@temp.com')) {
          const existingUser = await User.findOne({
            email,
            _id: { $ne: userId }
          });
          if (existingUser) {
            throw new Error("Cet email est déjà utilisé");
          }
        }

        // Validation
        if (!isValidEmail(email)) {
          throw new Error("Email invalide");
        }

        if (password !== confirmedPassword) {
          throw new Error("Les mots de passe ne correspondent pas");
        }

        if (!isValidPassword(password)) {
          throw new Error("Le mot de passe doit contenir au moins 6 caractères");
        }

        // Générer le code de vérification
        const verificationCode = generateVerificationCode();
        const verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Mettre à jour le User (2/3)
        user.email = email;
        user.password = password; // Sera hashé automatiquement par le pre-save hook
        user.verificationCode = verificationCode;
        user.verificationCodeExpires = verificationCodeExpires;
        await user.save();

        // Envoyer l'email de vérification
        await sendVerificationEmail(email, verificationCode, user.firstName);

        return {
          success: true,
          message: "Compte créé, vérifiez votre email pour confirmer (2/3)",
          userId: user._id.toString(),
          step: 2
        };
      } catch (error) {
        console.error("Erreur registerStep2:", error);
        throw new Error(error.message);
      }
    },

    // ========================================
    // ÉTAPE 3/3: VÉRIFICATION DU CODE
    // ========================================
    verifyRegistrationCode: async (_, args) => {
      try {
        const { userId, code } = args;

        // Trouver l'utilisateur
        const user = await User.findById(userId)
          .populate('studentProfile')
          .populate('teacherProfile');

        if (!user) {
          throw new Error("Utilisateur non trouvé");
        }

        // Vérifier le code
        if (!user.verificationCode) {
          throw new Error("Aucun code à vérifier, veuillez recommencer l'inscription");
        }

        if (user.verificationCode !== code) {
          // Supprimer le user et le profil en cas d'échec
          if (user.studentProfile) {
            await Student.findByIdAndDelete(user.studentProfile);
          }
          if (user.teacherProfile) {
            await Teacher.findByIdAndDelete(user.teacherProfile);
          }
          await User.findByIdAndDelete(userId);
          throw new Error("Code incorrect, compte supprimé");
        }

        // Vérifier l'expiration
        if (user.verificationCodeExpires < Date.now()) {
          // Supprimer le user et le profil en cas d'expiration
          if (user.studentProfile) {
            await Student.findByIdAndDelete(user.studentProfile);
          }
          if (user.teacherProfile) {
            await Teacher.findByIdAndDelete(user.teacherProfile);
          }
          await User.findByIdAndDelete(userId);
          throw new Error("Code expiré, compte supprimé");
        }

        // ✅ MODIFICATION ICI: On change seulement verified, PAS status
        // status reste INACTIVE par défaut
        user.verified = true;
        user.verificationCode = null;
        user.verificationCodeExpires = null;
        await user.save();

        // Générer le token
        const token = generateToken(user._id);

        return {
          token,
          user
        };
      } catch (error) {
        console.error("Erreur verifyRegistrationCode:", error);
        throw new Error(error.message);
      }
    },
    // ========================================
    // BONUS: RENVOYER LE CODE
    // ========================================
    resendVerificationCode: async (_, { userId }) => {
      try {
        const user = await User.findById(userId);

        if (!user) {
          throw new Error("Utilisateur non trouvé");
        }

        if (!user.email || user.email.includes('@temp.com')) {
          throw new Error("Email invalide");
        }

        // Générer un nouveau code
        const verificationCode = generateVerificationCode();
        const verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000);

        user.verificationCode = verificationCode;
        user.verificationCodeExpires = verificationCodeExpires;
        await user.save();

        // Renvoyer l'email
        await sendVerificationEmail(user.email, verificationCode, user.firstName);

        return {
          success: true,
          message: "Code de vérification renvoyé"
        };
      } catch (error) {
        console.error("Erreur resendVerificationCode:", error);
        throw new Error(error.message);
      }
    },

    // ========================================
    // AUTH (ancienne méthode - à garder)
    // ========================================
    register: async (_, args) => {
      const { email, password, firstName, lastName, phone, role } = args;

      if (!isValidEmail(email)) {
        throw new Error("Email invalide");
      }

      if (!isValidPassword(password)) {
        throw new Error("Le mot de passe doit contenir au moins 6 caractères");
      }

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        throw new Error("Cet email est déjà utilisé");
      }

      const user = await User.create({
        email,
        password,
        firstName,
        lastName,
        phone,
        role,
        status: "ACTIVE",
      });

      const token = generateToken(user._id);

      return { token, user };
    },

    login: async (_, { email, password }) => {
      const user = await User.findOne({ email });

      if (!user) {
        throw new Error("Email ou mot de passe incorrect");
      }

      const isValidPassword = await user.comparePassword(password);
      if (!isValidPassword) {
        throw new Error("Email ou mot de passe incorrect");
      }

      if (user.status !== "ACTIVE") {
        throw new Error("Votre compte est inactif");
      }

      const token = generateToken(user._id);

      return { token, user };
    },

    // ========================================
    // CREATE PROFILES
    // ========================================
    createStudentProfile: async (_, args, context) => {
      const { userId, parentName, educationLevel, currentYear } = args;

      const user = await User.findById(userId);
      if (!user) {
        throw new Error("Utilisateur non trouvé");
      }

      if (user.role !== "STUDENT") {
        throw new Error("Cet utilisateur n'est pas un étudiant");
      }

      if (user.studentProfile) {
        throw new Error("Ce profil étudiant existe déjà");
      }

      const student = await Student.create({
        userId: user._id,
        parentName,
        educationLevel,
        currentYear,
        credit: 100,
        enrolledSubjects: [],
      });

      user.studentProfile = student._id;
      await user.save();

      return student;
    },

    createTeacherProfile: async (_, args, context) => {
      const { userId, subjects, educationLevels } = args;

      const user = await User.findById(userId);
      if (!user) {
        throw new Error("Utilisateur non trouvé");
      }

      if (user.role !== "TEACHER") {
        throw new Error("Cet utilisateur n'est pas un professeur");
      }

      if (user.teacherProfile) {
        throw new Error("Ce profil professeur existe déjà");
      }

      const teacher = await Teacher.create({
        userId: user._id,
        subjects: subjects || [],
        educationLevels: educationLevels || [],
        selectedSubjects: [],
        credit: 0,
        totalEarnings: 0,
        withdrawable: 0,
      });

      user.teacherProfile = teacher._id;
      await user.save();

      return teacher;
    },

    createAdminProfile: async (_, args, context) => {
      requireRole(context, ["SUPER_ADMIN"]);

      const { userId, department, permissions } = args;

      const user = await User.findById(userId);
      if (!user) {
        throw new Error("Utilisateur non trouvé");
      }

      if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
        throw new Error("Cet utilisateur n'est pas un administrateur");
      }

      if (user.adminProfile) {
        throw new Error("Ce profil admin existe déjà");
      }

      const admin = await Admin.create({
        userId: user._id,
        department: department || "GENERAL",
        permissions: permissions || ["VIEW_USERS", "VIEW_TRANSACTIONS"],
        lastLogin: new Date(),
      });

      user.adminProfile = admin._id;
      await user.save();

      return admin;
    },

    // ========================================
    // USER MANAGEMENT
    // ========================================
    updateUser: async (_, args, context) => {
      const { id, ...updates } = args;

      if (context.user._id.toString() !== id) {
        requireRole(context, ["ADMIN", "SUPER_ADMIN"]);
      }

      const user = await User.findByIdAndUpdate(id, updates, { new: true });
      return user;
    },
    // Dans resolvers.js
    updateStudentProfile: async (_, args, context) => {
      requireRole(context, ["STUDENT"]);
      const student = await Student.findOne({ userId: context.user._id });
      if (!student) throw new Error("Profil étudiant non trouvé");

      if (args.currentYear !== undefined) student.currentYear = args.currentYear;
      if (args.educationLevel !== undefined) student.educationLevel = args.educationLevel;
      if (args.parentName !== undefined) student.parentName = args.parentName;

      await student.save();
      return student;
    },
    updateCredit: async (_, { userId, amount }, context) => {
      requireRole(context, ["ADMIN", "SUPER_ADMIN"]);

      const user = await User.findById(userId);
      user.credit += amount;
      await user.save();

      return user;
    },

    // ========================================
    // POINTS
    // ========================================
    purchasePoints: async (_, { amount }, context) => {
      requireAuth(context);

      const points = eurosToPoints(amount);
      const user = await User.findById(context.user._id);

      if (user.role === "STUDENT") {
        const student = await Student.findOne({ userId: user._id });
        student.credit += points;
        await student.save();
      } else if (user.role === "TEACHER") {
        const teacher = await Teacher.findOne({ userId: user._id });
        teacher.credit += points;
        await teacher.save();
      }

      const transaction = await Transaction.create({
        student: user._id,
        amount: points,
        type: "PURCHASE",
        companyCut: points,
        status: "COMPLETED",
        description: `Achat de ${points} points pour ${amount}€`,
      });

      return transaction;
    },

    // ========================================
    // SUBJECTS
    // ========================================
    createSubject: async (_, args, context) => {
      requireRole(context, ["ADMIN", "SUPER_ADMIN"]);

      const { name, description, level } = args;

      const existingSubject = await Subject.findOne({ name });
      if (existingSubject) {
        throw new Error("Une matière avec ce nom existe déjà");
      }

      const subject = await Subject.create({
        name,
        description,
        level,
        assignedTeachers: [],
        enrolledStudents: [],
        stats: {
          totalSales: 0,
          revenue: 0,
          studentsEnrolled: 0,
          teachersCount: 0,
        },
        contentStats: {
          totalVideos: 0,
          totalPdfs: 0,
          totalDuration: 0,
          totalSize: 0,
        },
      });

      return subject;
    },

    updateSubject: async (_, { id, ...updates }, context) => {
      requireRole(context, ["ADMIN", "SUPER_ADMIN"]);

      const subject = await Subject.findByIdAndUpdate(id, updates, {
        new: true,
      });
      return subject;
    },

    deleteSubject: async (_, { id }, context) => {
      requireRole(context, ["ADMIN", "SUPER_ADMIN"]);

      await Subject.findByIdAndDelete(id);

      return true;
    },

    assignTeacherToSubject: async (_, { subjectId, teacherId }, context) => {
      requireRole(context, ["ADMIN", "SUPER_ADMIN"]);

      const existingAssignment = await Subject.findOne({
        _id: subjectId,
        "assignedTeachers.teacherId": teacherId,
      });

      if (existingAssignment) {
        throw new Error("Ce professeur est déjà assigné à cette matière");
      }

      const subject = await Subject.findById(subjectId);
      if (!subject) throw new Error("Matière non trouvée");

      const teacher = await Teacher.findById(teacherId);
      if (!teacher) throw new Error("Professeur non trouvé");

      const assignment = {
        teacherId: teacher._id,
        userId: teacher.userId,
        assignedAt: new Date(),
      };

      const updatedSubject = await Subject.findByIdAndUpdate(
        subjectId,
        {
          $push: { assignedTeachers: assignment },
          $inc: { "stats.teachersCount": 1 },
        },
        { new: true, runValidators: true },
      );

      if (!teacher.selectedSubjects.some((s) => s.toString() === subjectId)) {
        teacher.selectedSubjects.push(subject._id);
        await teacher.save();
      }

      return updatedSubject;
    },

    removeTeacherFromSubject: async (_, { subjectId, teacherId }, context) => {
      requireRole(context, ["ADMIN", "SUPER_ADMIN"]);

      const subject = await Subject.findById(subjectId);
      const teacher = await Teacher.findById(teacherId);

      if (!subject || !teacher) {
        throw new Error("Matière ou professeur non trouvé");
      }

      subject.assignedTeachers = subject.assignedTeachers.filter(
        (t) => t.teacherId.toString() !== teacherId,
      );
      subject.stats.teachersCount = Math.max(
        0,
        subject.stats.teachersCount - 1,
      );
      await subject.save();

      teacher.selectedSubjects = teacher.selectedSubjects.filter(
        (s) => s.toString() !== subjectId,
      );
      await teacher.save();

      return subject;
    },

    buySubject: async (_, { subjectId }, context) => {
      requireRole(context, ["STUDENT"]);

      const user = await User.findById(context.user._id);
      const student = await Student.findOne({ userId: user._id });
      const subject = await Subject.findById(subjectId);

      if (!subject) {
        throw new Error("Matière non trouvée");
      }

      const alreadyEnrolled = subject.enrolledStudents.some(
        (s) => s.studentId.toString() === student._id.toString(),
      );

      if (alreadyEnrolled) {
        throw new Error("Vous avez déjà acheté cette matière");
      }

      const price = subject.price || 0;

      if (!hasSufficientCredit(student.credit, price)) {
        throw new Error(
          `Crédit insuffisant. Vous avez ${student.credit} points, il faut ${price} points`,
        );
      }

      const split = calculateSplit(price);

      student.credit -= price;
      student.enrolledSubjects.push(subjectId);
      await student.save();

      subject.enrolledStudents.push({
        studentId: student._id,
        userId: user._id,
        enrolledAt: new Date(),
        progress: 0,
      });

      const teacherCount = subject.assignedTeachers.length;
      if (teacherCount > 0) {
        const teacherShare = split.teacherCut / teacherCount;

        for (const assignedTeacher of subject.assignedTeachers) {
          const teacher = await Teacher.findById(assignedTeacher.teacherId);
          teacher.credit += teacherShare;
          teacher.withdrawable += teacherShare;
          teacher.totalEarnings += teacherShare;
          await teacher.save();
        }
      }

      subject.stats.totalSales += 1;
      subject.stats.revenue += subject.price;
      subject.stats.studentsEnrolled += 1;
      await subject.save();

      const transaction = await Transaction.create({
        student: user._id,
        subject: subjectId,
        amount: subject.price,
        type: "SUBJECT_BUY",
        teacherCut: split.teacherCut,
        companyCut: split.companyCut,
        status: "COMPLETED",
        description: `Achat de ${subject.name}`,
      });

      return await transaction.populate("student subject");
    },

    // ========================================
    // VIDEO PAYMENT (PAY-PER-VIDEO)
    // ========================================
    watchVideo: async (_, { subjectId, videoId }, context) => {
      requireRole(context, ["STUDENT"]);

      const student = await Student.findOne({ userId: context.user._id });
      if (!student) throw new Error("Profil étudiant non trouvé");

      const subject = await Subject.findById(subjectId);
      if (!subject) throw new Error("Matière non trouvée");

      const video = subject.videos.id(videoId);
      if (!video) throw new Error("Vidéo non trouvée dans cette matière");

      // Vidéo gratuite → accès libre
      if (!video.price || video.price === 0) {
        return {
          success: true,
          transaction: null,
          remainingCredit: student.credit,
          message: "Vidéo gratuite, accès accordé",
        };
      }

      // Vérifier idempotence : transaction déjà existante ?
      const existingTransaction = await Transaction.findOne({
        student: context.user._id,
        videoId: videoId,
        type: "VIDEO_WATCH",
        status: "COMPLETED",
      });

      if (existingTransaction) {
        return {
          success: true,
          transaction: existingTransaction,
          remainingCredit: student.credit,
          message: "Vidéo déjà payée, accès accordé",
        };
      }

      // Vérifier le solde
      if (student.credit < video.price) {
        throw new Error(
          `Solde insuffisant pour regarder cette vidéo. Vous avez ${student.credit} points, il faut ${video.price} points`
        );
      }

      // Calculer le split 70/30
      const teacherCut = Math.round(video.price * 0.70);
      const companyCut = video.price - teacherCut;

      try {
        // Débiter l'étudiant
        student.credit -= video.price;
        await student.save();

        // Créditer les professeurs
        const teacherCount = subject.assignedTeachers.length;
        if (teacherCount > 0) {
          const teacherShare = teacherCut / teacherCount;

          for (const assignedTeacher of subject.assignedTeachers) {
            const teacher = await Teacher.findById(assignedTeacher.teacherId);
            if (teacher) {
              teacher.credit += teacherShare;
              teacher.totalEarnings += teacherShare;
              teacher.withdrawable += teacherShare;
              await teacher.save();
            }
          }
        }

        // Créer la transaction
        const transaction = await Transaction.create({
          student: context.user._id,
          subject: subjectId,
          videoId: videoId,
          amount: video.price,
          type: "VIDEO_WATCH",
          teacherCut: teacherCut,
          companyCut: companyCut,
          status: "COMPLETED",
          description: `Visionnage vidéo: ${video.title}`,
        });

        return {
          success: true,
          transaction: transaction,
          remainingCredit: student.credit,
          message: `Vidéo payée avec succès (${video.price} points)`,
        };
      } catch (error) {
        // En cas d'erreur, tenter de restaurer le crédit
        try {
          student.credit += video.price;
          await student.save();
        } catch (rollbackError) {
          console.error("Erreur rollback crédit:", rollbackError);
        }
        throw new Error(`Erreur lors du paiement de la vidéo: ${error.message}`);
      }
    },

    // ========================================
    // PDF PAYMENT (PAY-PER-PDF)
    // ========================================
    readPDF: async (_, { subjectId, pdfId }, context) => {
      requireRole(context, ["STUDENT"]);

      const student = await Student.findOne({ userId: context.user._id });
      if (!student) throw new Error("Profil étudiant non trouvé");

      const subject = await Subject.findById(subjectId);
      if (!subject) throw new Error("Matière non trouvée");

      const pdf = subject.pdfs.id(pdfId);
      if (!pdf) throw new Error("PDF non trouvé dans cette matière");

      // PDF gratuit → accès libre
      if (!pdf.price || pdf.price === 0) {
        return {
          success: true,
          transaction: null,
          remainingCredit: student.credit,
          message: "PDF gratuit, accès accordé",
        };
      }

      // Vérifier idempotence
      const existingTransaction = await Transaction.findOne({
        student: context.user._id,
        pdfId: pdfId,
        type: "PDF_READ",
        status: "COMPLETED",
      });

      if (existingTransaction) {
        return {
          success: true,
          transaction: existingTransaction,
          remainingCredit: student.credit,
          message: "PDF déjà payé, accès accordé",
        };
      }

      // Vérifier le solde
      if (student.credit < pdf.price) {
        throw new Error(
          `Solde insuffisant pour lire ce PDF. Vous avez ${student.credit} points, il faut ${pdf.price} points`
        );
      }

      const teacherCut = Math.round(pdf.price * 0.70);
      const companyCut = pdf.price - teacherCut;

      try {
        student.credit -= pdf.price;
        await student.save();

        const teacherCount = subject.assignedTeachers.length;
        if (teacherCount > 0) {
          const teacherShare = teacherCut / teacherCount;
          for (const assignedTeacher of subject.assignedTeachers) {
            const teacher = await Teacher.findById(assignedTeacher.teacherId);
            if (teacher) {
              teacher.credit += teacherShare;
              teacher.totalEarnings += teacherShare;
              teacher.withdrawable += teacherShare;
              await teacher.save();
            }
          }
        }

        const transaction = await Transaction.create({
          student: context.user._id,
          subject: subjectId,
          pdfId: pdfId,
          amount: pdf.price,
          type: "PDF_READ",
          teacherCut: teacherCut,
          companyCut: companyCut,
          status: "COMPLETED",
          description: `Lecture PDF: ${pdf.title}`,
        });

        return {
          success: true,
          transaction: transaction,
          remainingCredit: student.credit,
          message: `PDF payé avec succès (${pdf.price} points)`,
        };
      } catch (error) {
        try {
          student.credit += pdf.price;
          await student.save();
        } catch (rollbackError) {
          console.error("Erreur rollback crédit:", rollbackError);
        }
        throw new Error(`Erreur lors du paiement du PDF: ${error.message}`);
      }
    },

    updateVideoPrice: async (_, { subjectId, videoId, price }, context) => {
      requireRole(context, ["ADMIN", "SUPER_ADMIN", "TEACHER"]);

      const subject = await Subject.findById(subjectId);
      if (!subject) throw new Error("Matière non trouvée");

      // Si TEACHER, vérifier qu'il est assigné à cette matière
      if (context.user.role === "TEACHER") {
        const teacher = await Teacher.findOne({ userId: context.user._id });
        const isAssigned = subject.assignedTeachers.some(
          (t) => t.teacherId.toString() === teacher._id.toString()
        );
        if (!isAssigned) {
          throw new Error("Vous n'êtes pas assigné à cette matière");
        }
      }

      const video = subject.videos.id(videoId);
      if (!video) throw new Error("Vidéo non trouvée");

      video.price = price;
      await subject.save();

      return subject;
    },

    updatePDFPrice: async (_, { subjectId, pdfId, price }, context) => {
      requireRole(context, ["ADMIN", "SUPER_ADMIN", "TEACHER"]);

      const subject = await Subject.findById(subjectId);
      if (!subject) throw new Error("Matière non trouvée");

      // Si TEACHER, vérifier qu'il est assigné à cette matière
      if (context.user.role === "TEACHER") {
        const teacher = await Teacher.findOne({ userId: context.user._id });
        const isAssigned = subject.assignedTeachers.some(
          (t) => t.teacherId.toString() === teacher._id.toString()
        );
        if (!isAssigned) {
          throw new Error("Vous n'êtes pas assigné à cette matière");
        }
      }

      const pdf = subject.pdfs.id(pdfId);
      if (!pdf) throw new Error("PDF non trouvé");

      pdf.price = price;
      await subject.save();

      return subject;
    },

    // ========================================
    // CONTENT
    // ========================================
    deleteVideo: async (_, { subjectId, videoId }, context) => {
      requireRole(context, ["ADMIN", "SUPER_ADMIN", "TEACHER"]);

      const subject = await Subject.findById(subjectId);
      if (!subject) {
        throw new Error("Matière non trouvée");
      }

      subject.videos.id(videoId).remove();
      await subject.save();

      return subject;
    },

    deletePDF: async (_, { subjectId, pdfId }, context) => {
      requireRole(context, ["ADMIN", "SUPER_ADMIN", "TEACHER"]);

      const subject = await Subject.findById(subjectId);
      if (!subject) {
        throw new Error("Matière non trouvée");
      }

      subject.pdfs.id(pdfId).remove();
      await subject.save();

      return subject;
    },

    // ========================================
    // PROGRESSION VIDÉO
    // ========================================
    updateVideoProgress: async (_, args, context) => {
      requireRole(context, ["STUDENT"]);

      const { subjectId, videoId, watchedTime, lastPosition } = args;
      const student = await Student.findOne({ userId: context.user._id });
      const subject = await Subject.findById(subjectId);

      if (!subject) {
        throw new Error("Matière non trouvée");
      }

      const video = subject.videos.id(videoId);
      if (!video) {
        throw new Error("Vidéo non trouvée");
      }

      // Vérifier l'accès à la vidéo payante
      if (video.price && video.price > 0) {
        const hasAccess = await Transaction.findOne({
          student: context.user._id,
          videoId: videoId,
          type: "VIDEO_WATCH",
          status: "COMPLETED",
        });
        if (!hasAccess) {
          throw new Error("Accès non autorisé à cette vidéo. Veuillez d'abord payer pour y accéder.");
        }
      }

      const completionPercentage =
        video.duration > 0 ? (watchedTime / video.duration) * 100 : 0;
      const completed = completionPercentage >= 90;

      const progress = await VideoProgress.findOneAndUpdate(
        { student: student._id, videoId },
        {
          subject: subject._id,
          watchedTime,
          lastPosition,
          completionPercentage: Math.min(completionPercentage, 100),
          completed,
          lastWatchedAt: new Date(),
        },
        { upsert: true, new: true },
      );

      return progress;
    },

    // ========================================
    // PROGRESSION PDF
    // ========================================
    updatePDFProgress: async (_, args, context) => {
      requireRole(context, ["STUDENT"]);

      const { subjectId, pdfId, pagesRead, lastPage } = args;
      const student = await Student.findOne({ userId: context.user._id });
      const subject = await Subject.findById(subjectId);

      if (!subject) {
        throw new Error("Matière non trouvée");
      }

      if (!student.enrolledSubjects.includes(subjectId)) {
        throw new Error("Vous n'avez pas acheté cette matière");
      }

      const pdf = subject.pdfs.id(pdfId);
      if (!pdf) {
        throw new Error("PDF non trouvé");
      }

      // Vérifier l'accès au PDF payant
      if (pdf.price && pdf.price > 0) {
        const hasAccess = await Transaction.findOne({
          student: context.user._id,
          pdfId: pdfId,
          type: "PDF_READ",
          status: "COMPLETED",
        });
        if (!hasAccess) {
          throw new Error("Accès non autorisé à ce PDF. Veuillez d'abord payer.");
        }
      }

      const completionPercentage =
        pdf.pageCount > 0 ? (pagesRead.length / pdf.pageCount) * 100 : 0;
      const completed = completionPercentage >= 90;

      const progress = await PDFProgress.findOneAndUpdate(
        { student: student._id, pdfId },
        {
          subject: subject._id,
          pagesRead,
          lastPage,
          completionPercentage: Math.min(completionPercentage, 100),
          completed,
          lastReadAt: new Date(),
        },
        { upsert: true, new: true },
      );

      return progress;
    },

    // ========================================
    // ÉVALUATIONS
    // ========================================
    rateVideo: async (_, args, context) => {
      requireRole(context, ["STUDENT"]);

      const { subjectId, videoId, rating, comment } = args;

      if (!isValidRating(rating)) {
        throw new Error("La note doit être entre 1 et 5");
      }

      if (comment && !isValidComment(comment)) {
        throw new Error("Le commentaire est trop long (max 1000 caractères)");
      }

      const student = await Student.findOne({ userId: context.user._id });
      const subject = await Subject.findById(subjectId);

      if (!subject) {
        throw new Error("Matière non trouvée");
      }

      if (!student.enrolledSubjects.includes(subjectId)) {
        throw new Error("Vous devez avoir acheté cette matière pour l'évaluer");
      }

      const video = subject.videos.id(videoId);
      if (!video) {
        throw new Error("Vidéo non trouvée");
      }

      const existing = await Rating.findOne({
        student: student._id,
        targetType: "VIDEO",
        video: videoId,
      });

      if (existing) {
        throw new Error(
          "Vous avez déjà évalué cette vidéo. Utilisez updateRating pour modifier.",
        );
      }

      const newRating = await Rating.create({
        student: student._id,
        studentUserId: context.user._id,
        targetType: "VIDEO",
        video: videoId,
        subject: subjectId,
        rating,
        comment,
      });

      return newRating;
    },

    ratePDF: async (_, args, context) => {
      requireRole(context, ["STUDENT"]);

      const { subjectId, pdfId, rating, comment } = args;

      if (!isValidRating(rating)) {
        throw new Error("La note doit être entre 1 et 5");
      }

      if (comment && !isValidComment(comment)) {
        throw new Error("Le commentaire est trop long");
      }

      const student = await Student.findOne({ userId: context.user._id });
      const subject = await Subject.findById(subjectId);

      if (!subject) {
        throw new Error("Matière non trouvée");
      }

      if (!student.enrolledSubjects.includes(subjectId)) {
        throw new Error("Vous devez avoir acheté cette matière pour l'évaluer");
      }

      const pdf = subject.pdfs.id(pdfId);
      if (!pdf) {
        throw new Error("PDF non trouvé");
      }

      const existing = await Rating.findOne({
        student: student._id,
        targetType: "PDF",
        pdf: pdfId,
      });

      if (existing) {
        throw new Error("Vous avez déjà évalué ce PDF");
      }

      const newRating = await Rating.create({
        student: student._id,
        studentUserId: context.user._id,
        targetType: "PDF",
        pdf: pdfId,
        subject: subjectId,
        rating,
        comment,
      });

      return newRating;
    },

    rateSubject: async (_, args, context) => {
      requireRole(context, ["STUDENT"]);

      const { subjectId, rating, comment } = args;

      if (!isValidRating(rating)) {
        throw new Error("La note doit être entre 1 et 5");
      }

      const student = await Student.findOne({ userId: context.user._id });

      if (!student.enrolledSubjects.includes(subjectId)) {
        throw new Error("Vous devez avoir acheté cette matière pour l'évaluer");
      }

      const existing = await Rating.findOne({
        student: student._id,
        targetType: "SUBJECT",
        subject: subjectId,
      });

      if (existing) {
        throw new Error("Vous avez déjà évalué cette matière");
      }

      const newRating = await Rating.create({
        student: student._id,
        studentUserId: context.user._id,
        targetType: "SUBJECT",
        subject: subjectId,
        rating,
        comment,
      });

      const allRatings = await Rating.find({
        subject: subjectId,
        targetType: "SUBJECT",
      });

      const totalRatings = allRatings.length;
      const averageRating =
        allRatings.reduce((sum, r) => sum + r.rating, 0) / totalRatings;

      const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      allRatings.forEach((r) => {
        ratingDistribution[r.rating]++;
      });

      await Subject.findByIdAndUpdate(subjectId, {
        "ratingsStats.averageRating": averageRating,
        "ratingsStats.totalRatings": totalRatings,
        "ratingsStats.ratingDistribution": ratingDistribution,
      });

      return newRating;
    },

    rateTeacher: async (_, args, context) => {
      requireRole(context, ["STUDENT"]);

      const { teacherId, rating, comment } = args;

      if (!isValidRating(rating)) {
        throw new Error("La note doit être entre 1 et 5");
      }

      const student = await Student.findOne({ userId: context.user._id });
      const teacher = await Teacher.findById(teacherId);

      if (!teacher) {
        throw new Error("Professeur non trouvé");
      }

      const hasSubjectWithTeacher = await Subject.findOne({
        _id: { $in: student.enrolledSubjects },
        "assignedTeachers.teacherId": teacherId,
      });

      if (!hasSubjectWithTeacher) {
        throw new Error(
          "Vous devez avoir suivi un cours de ce professeur pour l'évaluer",
        );
      }

      const existing = await Rating.findOne({
        student: student._id,
        targetType: "TEACHER",
        teacher: teacherId,
      });

      if (existing) {
        throw new Error("Vous avez déjà évalué ce professeur");
      }

      const newRating = await Rating.create({
        student: student._id,
        studentUserId: context.user._id,
        targetType: "TEACHER",
        teacher: teacherId,
        rating,
        comment,
      });

      const allRatings = await Rating.find({
        teacher: teacherId,
        targetType: "TEACHER",
      });

      const totalRatings = allRatings.length;
      const averageRating =
        allRatings.reduce((sum, r) => sum + r.rating, 0) / totalRatings;

      await Teacher.findByIdAndUpdate(teacherId, {
        "ratingsStats.averageRating": averageRating,
        "ratingsStats.totalRatings": totalRatings,
      });

      return newRating;
    },

    updateRating: async (_, args, context) => {
      requireRole(context, ["STUDENT"]);

      const { ratingId, rating, comment } = args;

      if (!isValidRating(rating)) {
        throw new Error("La note doit être entre 1 et 5");
      }

      const student = await Student.findOne({ userId: context.user._id });
      const existingRating = await Rating.findById(ratingId);

      if (!existingRating) {
        throw new Error("Évaluation non trouvée");
      }

      if (existingRating.student.toString() !== student._id.toString()) {
        throw new Error("Vous ne pouvez modifier que vos propres évaluations");
      }

      existingRating.rating = rating;
      if (comment !== undefined) {
        existingRating.comment = comment;
      }
      existingRating.updatedAt = new Date();

      await existingRating.save();

      return existingRating;
    },

    deleteRating: async (_, { ratingId }, context) => {
      requireRole(context, ["STUDENT"]);

      const student = await Student.findOne({ userId: context.user._id });
      const rating = await Rating.findById(ratingId);

      if (!rating) {
        throw new Error("Évaluation non trouvée");
      }

      if (rating.student.toString() !== student._id.toString()) {
        throw new Error("Vous ne pouvez supprimer que vos propres évaluations");
      }

      await Rating.findByIdAndDelete(ratingId);

      return true;
    },

    // ========================================
    // MESSAGES
    // ========================================
    sendMessage: async (_, args, context) => {
      requireAuth(context);

      const message = await Message.create({
        sender: context.user._id,
        ...args,
      });

      return await message.populate("sender recipient subject");
    },

    markMessageAsRead: async (_, { id }, context) => {
      requireAuth(context);

      const message = await Message.findByIdAndUpdate(
        id,
        { isRead: true },
        { new: true },
      ).populate("sender recipient subject");

      return message;
    },

    // ========================================
    // WITHDRAWAL
    // ========================================
    requestWithdrawal: async (_, { amount }, context) => {
      requireRole(context, ["TEACHER"]);

      const teacher = await Teacher.findOne({ userId: context.user._id });

      if (!hasSufficientCredit(teacher.withdrawable, amount)) {
        throw new Error("Crédit disponible insuffisant");
      }

      teacher.withdrawable -= amount;
      await teacher.save();

      const transaction = await Transaction.create({
        teacher: context.user._id,
        amount,
        type: "WITHDRAWAL",
        status: "PENDING",
        description: `Demande de retrait de ${amount} points`,
      });

      return transaction;
    },

    // ========================================
    // ADMIN ACTIONS
    // ========================================
    toggleUserStatus: async (_, { userId }, context) => {
      requireRole(context, ["ADMIN", "SUPER_ADMIN"]);

      const user = await User.findById(userId);

      if (!user) {
        throw new Error("Utilisateur non trouvé");
      }

      user.status = user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      await user.save();

      return user;
    },

    createAdminUser: async (_, args, context) => {
      requireRole(context, ["SUPER_ADMIN"]);

      const { email, password, firstName, lastName, phone, department, permissions } = args;

      if (!isValidEmail(email)) {
        throw new Error("Email invalide");
      }

      if (!isValidPassword(password)) {
        throw new Error("Le mot de passe doit contenir au moins 6 caractères");
      }

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        throw new Error("Cet email est déjà utilisé");
      }

      const user = await User.create({
        email,
        password,
        firstName,
        lastName,
        phone,
        role: "ADMIN",
        status: "ACTIVE",
      });

      const admin = await Admin.create({
        userId: user._id,
        department: department || "GENERAL",
        permissions: permissions || ["VIEW_USERS", "VIEW_TRANSACTIONS"],
        lastLogin: new Date(),
      });

      user.adminProfile = admin._id;
      await user.save();

      const token = generateToken(user._id);

      return { token, user };
    },

    // ========================================
    // MÉMORISATION IA
    // ========================================
    ...memoryResolvers.Mutation,
  },

  // ========================================
  // FIELD RESOLVERS
  // ========================================
  User: {
    studentProfile: async (parent) => {
      if (parent.studentProfile) {
        return await Student.findById(parent.studentProfile).populate(
          "enrolledSubjects",
        );
      }
      return null;
    },
    teacherProfile: async (parent) => {
      if (parent.teacherProfile) {
        return await Teacher.findById(parent.teacherProfile).populate(
          "selectedSubjects",
        );
      }
      return null;
    },
    adminProfile: async (parent) => {
      if (parent.adminProfile) {
        return await Admin.findById(parent.adminProfile);
      }
      return null;
    },
  },

  Student: {
    user: async (parent) => {
      return await User.findById(parent.userId);
    },
    enrolledSubjects: async (parent) => {
      if (!parent.enrolledSubjects || parent.enrolledSubjects.length === 0) {
        return [];
      }
      return await Subject.find({ _id: { $in: parent.enrolledSubjects } });
    },
  },

  Teacher: {
    user: async (parent) => {
      return await User.findById(parent.userId);
    },
    selectedSubjects: async (parent) => {
      if (!parent.selectedSubjects || parent.selectedSubjects.length === 0) {
        return [];
      }
      return await Subject.find({ _id: { $in: parent.selectedSubjects } });
    },
    ratingsStats: (parent) => {
      return {
        averageRating: parent.ratingsStats?.averageRating || 0,
        totalRatings: parent.ratingsStats?.totalRatings || 0,
        ratingDistribution: {
          one: 0,
          two: 0,
          three: 0,
          four: 0,
          five: 0,
        },
      };
    },
  },

  Admin: {
    user: async (parent) => {
      return await User.findById(parent.userId);
    },
  },

  Subject: {
    stats: (parent) => {
      return {
        totalSales: parent.stats?.totalSales || 0,
        revenue: parent.stats?.revenue || 0,
        studentsEnrolled: parent.stats?.studentsEnrolled || 0,
        teachersCount: parent.stats?.teachersCount || 0,
      };
    },

    contentStats: (parent) => {
      return {
        totalVideos:
          parent.contentStats?.totalVideos || parent.videos?.length || 0,
        totalPdfs: parent.contentStats?.totalPdfs || parent.pdfs?.length || 0,
        totalDuration: parent.contentStats?.totalDuration || 0,
        totalSize: parent.contentStats?.totalSize || 0,
      };
    },

    ratingsStats: (parent) => {
      const dist = parent.ratingsStats?.ratingDistribution || {};
      return {
        averageRating: parent.ratingsStats?.averageRating || 0,
        totalRatings: parent.ratingsStats?.totalRatings || 0,
        ratingDistribution: {
          one: dist["1"] || 0,
          two: dist["2"] || 0,
          three: dist["3"] || 0,
          four: dist["4"] || 0,
          five: dist["5"] || 0,
        },
      };
    },

    assignedTeachers: async (parent) => {
      if (!parent.assignedTeachers || !Array.isArray(parent.assignedTeachers)) {
        return [];
      }

      const teachers = [];
      for (const assigned of parent.assignedTeachers) {
        const teacher = await Teacher.findById(assigned.teacherId);
        const user = await User.findById(assigned.userId);
        teachers.push({
          teacherId: assigned.teacherId,
          teacher,
          userId: assigned.userId,
          user,
          assignedAt: assigned.assignedAt,
        });
      }
      return teachers;
    },

    enrolledStudents: async (parent) => {
      if (!parent.enrolledStudents || !Array.isArray(parent.enrolledStudents)) {
        return [];
      }

      const students = [];
      for (const enrolled of parent.enrolledStudents) {
        const student = await Student.findById(enrolled.studentId);
        const user = await User.findById(enrolled.userId);
        students.push({
          studentId: enrolled.studentId,
          student,
          userId: enrolled.userId,
          user,
          enrolledAt: enrolled.enrolledAt,
          progress: enrolled.progress,
        });
      }
      return students;
    },
  },

  Rating: {
    student: async (parent) => {
      return await Student.findById(parent.student);
    },
    subject: async (parent) => {
      if (parent.subject) {
        return await Subject.findById(parent.subject);
      }
      return null;
    },
    teacher: async (parent) => {
      if (parent.teacher) {
        return await Teacher.findById(parent.teacher);
      }
      return null;
    },
  },

  VideoProgress: {
    student: async (parent) => {
      return await Student.findById(parent.student);
    },
    subject: async (parent) => {
      return await Subject.findById(parent.subject);
    },
  },

  PDFProgress: {
    student: async (parent) => {
      return await Student.findById(parent.student);
    },
    subject: async (parent) => {
      return await Subject.findById(parent.subject);
    },
  },

  ProfileUnion: {
    __resolveType(obj) {
      if (obj.parentName) {
        return "Student";
      }
      if (obj.totalEarnings !== undefined) {
        return "Teacher";
      }
      if (obj.permissions) {
        return "Admin";
      }
      return null;
    },
  },
};

module.exports = resolvers;  