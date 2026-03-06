const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Subject = require('../models/Subject');
const Transaction = require('../models/Transaction');
const Rating = require('../models/rating');
const VideoProgress = require('../models/VideoProgress');
const User = require('../models/User');

// Import des fonctions utilitaires
const {
    calculateChange,
    getPreviousPeriod,
    getDefaultDateRange,
    formatNumber,
    formatCurrency
} = require('../utils/statsCalculator');

const dashboardResolvers = {
    Query: {
        // ==========================================
        // 1️⃣ DASHBOARD KPIs
        // ==========================================
        dashboardKPIs: async (_, { dateRange }, context) => {
            const { startDate, endDate } = dateRange || getDefaultDateRange();

            // 1.1 - INSCRIPTIONS TOTALES
            const totalStudents = await Student.countDocuments({
                createdAt: { $lte: endDate }
            });

            const previousPeriod = getPreviousPeriod(startDate, endDate);
            const previousStudents = await Student.countDocuments({
                createdAt: {
                    $gte: previousPeriod.start,
                    $lt: previousPeriod.end
                }
            });

            const enrollmentChange = calculateChange(
                totalStudents,
                previousStudents
            );

            // 1.2 - TAUX DE RÉTENTION
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const activeStudents = await VideoProgress.distinct('student', {
                lastWatchedAt: { $gte: thirtyDaysAgo }
            });

            const retentionRate = totalStudents > 0
                ? (activeStudents.length / totalStudents) * 100
                : 0;

            // Rétention période précédente
            const previousActiveStudents = await VideoProgress.distinct('student', {
                lastWatchedAt: {
                    $gte: new Date(thirtyDaysAgo.getTime() - 30 * 24 * 60 * 60 * 1000),
                    $lt: thirtyDaysAgo
                }
            });

            const previousRetention = totalStudents > 0
                ? (previousActiveStudents.length / totalStudents) * 100
                : 0;

            const retentionChange = retentionRate - previousRetention;

            // 1.3 - REVENUS TOTAUX
            const revenueData = await Transaction.aggregate([
                {
                    $match: {
                        status: 'COMPLETED',
                        type: { $in: ['PURCHASE', 'SUBJECT_BUY', 'AI_USE'] },
                        createdAt: { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$amount' }
                    }
                }
            ]);

            const totalRevenue = revenueData[0]?.total || 0;

            const previousRevenueData = await Transaction.aggregate([
                {
                    $match: {
                        status: 'COMPLETED',
                        type: { $in: ['PURCHASE', 'SUBJECT_BUY', 'AI_USE'] },
                        createdAt: {
                            $gte: previousPeriod.start,
                            $lte: previousPeriod.end
                        }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$amount' }
                    }
                }
            ]);

            const previousRevenue = previousRevenueData[0]?.total || 0;
            const revenueChange = calculateChange(totalRevenue, previousRevenue);

            // 1.4 - SATISFACTION ÉTUDIANTE
            const satisfactionData = await Rating.aggregate([
                {
                    $match: {
                        createdAt: { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $group: {
                        _id: null,
                        avgRating: { $avg: '$rating' },
                        count: { $sum: 1 }
                    }
                }
            ]);

            const averageRating = satisfactionData[0]?.avgRating || 0;

            const previousSatisfactionData = await Rating.aggregate([
                {
                    $match: {
                        createdAt: {
                            $gte: previousPeriod.start,
                            $lte: previousPeriod.end
                        }
                    }
                },
                {
                    $group: {
                        _id: null,
                        avgRating: { $avg: '$rating' }
                    }
                }
            ]);

            const previousRating = previousSatisfactionData[0]?.avgRating || 0;
            const satisfactionChange = averageRating - previousRating;

            return {
                totalEnrollments: {
                    value: formatNumber(totalStudents),
                    numericValue: totalStudents,
                    change: enrollmentChange,
                    changeType: enrollmentChange >= 0 ? 'POSITIVE' : 'NEGATIVE',
                    trend: {
                        direction: enrollmentChange >= 0 ? 'UP' : 'DOWN',
                        description: `${enrollmentChange >= 0 ? '+' : ''}${totalStudents - previousStudents} ce mois`
                    }
                },
                retentionRate: {
                    value: `${retentionRate.toFixed(1)}%`,
                    numericValue: retentionRate,
                    change: retentionChange,
                    changeType: retentionChange >= 0 ? 'POSITIVE' : 'NEGATIVE',
                    trend: {
                        direction: retentionChange >= 0 ? 'UP' : 'DOWN',
                        description: retentionRate >= 90 ? 'Objectif atteint' : 'Objectif: 90%'
                    }
                },
                totalRevenue: {
                    value: formatCurrency(totalRevenue),
                    numericValue: totalRevenue,
                    change: revenueChange,
                    changeType: revenueChange >= 0 ? 'POSITIVE' : 'NEGATIVE',
                    trend: {
                        direction: revenueChange >= 0 ? 'UP' : 'DOWN',
                        description: `${revenueChange >= 0 ? '+' : ''}${formatCurrency(totalRevenue - previousRevenue)} ce mois`
                    }
                },
                studentSatisfaction: {
                    value: `${averageRating.toFixed(1)}/5`,
                    numericValue: averageRating,
                    change: satisfactionChange,
                    changeType: satisfactionChange >= 0 ? 'POSITIVE' : 'NEGATIVE',
                    trend: {
                        direction: satisfactionChange >= 0 ? 'UP' : 'DOWN',
                        description: averageRating < 4 ? 'Nécessite attention' : 'Excellent'
                    }
                }
            };
        },

        // ==========================================
        // 2️⃣ TENDANCES MENSUELLES
        // ==========================================
        monthlyTrends: async (_, { months = 12 }, context) => {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - months);

            // Enrollments par mois
            const enrollments = await Student.aggregate([
                {
                    $match: {
                        createdAt: { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $group: {
                        _id: {
                            year: { $year: '$createdAt' },
                            month: { $month: '$createdAt' }
                        },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ]);

            // Completion moyenne par mois
            const completions = await VideoProgress.aggregate([
                {
                    $match: {
                        lastWatchedAt: { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $group: {
                        _id: {
                            year: { $year: '$lastWatchedAt' },
                            month: { $month: '$lastWatchedAt' }
                        },
                        avgCompletion: { $avg: '$completionPercentage' }
                    }
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ]);

            // Revenus par mois
            const revenues = await Transaction.aggregate([
                {
                    $match: {
                        status: 'COMPLETED',
                        type: { $in: ['PURCHASE', 'SUBJECT_BUY', 'AI_USE'] },
                        createdAt: { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $group: {
                        _id: {
                            year: { $year: '$createdAt' },
                            month: { $month: '$createdAt' }
                        },
                        total: { $sum: '$amount' }
                    }
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ]);

            // Merge les données
            const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
                'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

            const trends = [];
            for (let i = 0; i < months; i++) {
                const date = new Date(startDate);
                date.setMonth(date.getMonth() + i);

                const year = date.getFullYear();
                const month = date.getMonth() + 1;

                const enrollment = enrollments.find(
                    e => e._id.year === year && e._id.month === month
                )?.count || 0;

                const completion = completions.find(
                    c => c._id.year === year && c._id.month === month
                )?.avgCompletion || 0;

                const revenue = revenues.find(
                    r => r._id.year === year && r._id.month === month
                )?.total || 0;

                trends.push({
                    month: monthNames[month - 1],
                    year,
                    enrollment,
                    completion: parseFloat(completion.toFixed(1)),
                    revenue: parseFloat((revenue / 1000).toFixed(1)) // En K€
                });
            }

            return trends;
        },

        // ==========================================
        // 3️⃣ TOP COURS PERFORMANTS
        // ==========================================
        topPerformingCourses: async (_, { limit = 10 }, context) => {
            const subjects = await Subject.find({ status: 'ACTIVE' })
                .populate('enrolledStudents');

            const enrichedSubjects = await Promise.all(
                subjects.map(async (subject) => {
                    const studentsCount = subject.enrolledStudents?.length || 0;

                    // Note moyenne
                    const ratingsData = await Rating.aggregate([
                        {
                            $match: {
                                subject: subject._id,
                                targetType: 'SUBJECT'
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                avgRating: { $avg: '$rating' }
                            }
                        }
                    ]);

                    const averageRating = ratingsData[0]?.avgRating || 0;

                    // Revenus
                    const revenueData = await Transaction.aggregate([
                        {
                            $match: {
                                subject: subject._id,
                                type: 'SUBJECT_BUY',
                                status: 'COMPLETED'
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                total: { $sum: '$amount' }
                            }
                        }
                    ]);

                    const revenue = revenueData[0]?.total || 0;

                    // Statut performance
                    let status = 'LOW';
                    if (averageRating >= 4.5) status = 'HIGH';
                    else if (averageRating >= 3.5) status = 'MEDIUM';

                    // Score de performance combiné
                    const performanceScore = (studentsCount * 0.4) + (averageRating * 100 * 0.6);

                    return {
                        id: subject._id,
                        name: subject.name,
                        studentsCount,
                        averageRating: parseFloat(averageRating.toFixed(1)),
                        status,
                        revenue,
                        performanceScore
                    };
                })
            );

            return enrichedSubjects
                .sort((a, b) => b.performanceScore - a.performanceScore)
                .slice(0, limit);
        },

        // ==========================================
        // 4️⃣ ÉTUDIANTS À RISQUE
        // ==========================================
        atRiskStudents: async (_, { limit = 10 }, context) => {
            const twoWeeksAgo = new Date();
            twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

            const subjects = await Subject.find({ status: 'ACTIVE' })
                .populate('enrolledStudents');

            const atRiskBySubject = await Promise.all(
                subjects.map(async (subject) => {
                    let studentsAtRisk = 0;

                    for (const enrollment of subject.enrolledStudents || []) {
                        const { student, enrolledAt, progress } = enrollment;

                        // Seulement les étudiants inscrits depuis >14 jours
                        if (enrolledAt > twoWeeksAgo) continue;

                        // Progression vidéo
                        const videoProgress = await VideoProgress.find({
                            student: student._id || student,
                            subject: subject._id
                        });

                        const avgProgress = videoProgress.length > 0
                            ? videoProgress.reduce((sum, v) => sum + v.completionPercentage, 0) / videoProgress.length
                            : 0;

                        // Dernière activité
                        const lastActivity = await VideoProgress.findOne({
                            student: student._id || student,
                            subject: subject._id
                        }).sort('-lastWatchedAt');

                        const daysSinceActivity = lastActivity
                            ? Math.floor((new Date() - lastActivity.lastWatchedAt) / (1000 * 60 * 60 * 24))
                            : 999;

                        // Facteurs de risque
                        let riskFactors = 0;
                        if (avgProgress < 20) riskFactors++;
                        if (daysSinceActivity > 14) riskFactors++;
                        if (progress < 15) riskFactors++;

                        if (riskFactors >= 2) {
                            studentsAtRisk++;
                        }
                    }

                    if (studentsAtRisk === 0) return null;

                    // Sévérité
                    let severity = 'LOW';
                    if (studentsAtRisk > 20) severity = 'HIGH';
                    else if (studentsAtRisk >= 10) severity = 'MEDIUM';

                    return {
                        subjectId: subject._id,
                        subjectName: subject.name,
                        studentsAtRisk,
                        severity
                    };
                })
            );

            return atRiskBySubject
                .filter(item => item !== null)
                .sort((a, b) => b.studentsAtRisk - a.studentsAtRisk)
                .slice(0, limit);
        },

        // ==========================================
        // 5️⃣ PERFORMANCE PAR DÉPARTEMENT
        // ==========================================
        departmentPerformance: async (_, __, context) => {
            const categoryIcons = {
                'Sciences': 'Atom',
                'Sciences humaines': 'BookOpen',
                'Ingénierie': 'Cpu',
                'Commerce': 'Briefcase',
                'Arts': 'Palette'
            };

            const categories = await Subject.distinct('category', {
                status: 'ACTIVE'
            });

            const departmentStats = await Promise.all(
                categories.map(async (category) => {
                    const subjects = await Subject.find({
                        category,
                        status: 'ACTIVE'
                    }).populate('enrolledStudents').populate('assignedTeachers');

                    const subjectIds = subjects.map(s => s._id);

                    // 1. Étudiants uniques
                    const uniqueStudents = new Set();
                    subjects.forEach(subject => {
                        subject.enrolledStudents?.forEach(enrollment => {
                            const studentId = enrollment.studentId?._id || enrollment.studentId;
                            uniqueStudents.add(studentId.toString());
                        });
                    });
                    const studentsCount = uniqueStudents.size;

                    // 2. Rétention
                    const thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                    const activeStudents = await VideoProgress.distinct('student', {
                        subject: { $in: subjectIds },
                        lastWatchedAt: { $gte: thirtyDaysAgo }
                    });

                    const retention = studentsCount > 0
                        ? (activeStudents.length / studentsCount) * 100
                        : 0;

                    // 3. Satisfaction
                    const satisfactionData = await Rating.aggregate([
                        {
                            $match: {
                                subject: { $in: subjectIds }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                avgRating: { $avg: '$rating' }
                            }
                        }
                    ]);

                    const satisfaction = satisfactionData[0]?.avgRating
                        ? (satisfactionData[0].avgRating / 5) * 100
                        : 0;

                    // 4. Revenus
                    const revenueData = await Transaction.aggregate([
                        {
                            $match: {
                                subject: { $in: subjectIds },
                                type: 'SUBJECT_BUY',
                                status: 'COMPLETED'
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                total: { $sum: '$amount' }
                            }
                        }
                    ]);

                    const revenue = revenueData[0]?.total || 0;

                    // 5. Cours actifs
                    const activeCourses = subjects.length;

                    // 6. Enseignants uniques
                    const uniqueTeachers = new Set();
                    subjects.forEach(subject => {
                        subject.assignedTeachers?.forEach(assignment => {
                            const teacherId = assignment.teacherId?._id || assignment.teacherId;
                            uniqueTeachers.add(teacherId.toString());
                        });
                    });
                    const teachersCount = uniqueTeachers.size;

                    // 7. Taux de réussite
                    const completedStudents = await VideoProgress.distinct('student', {
                        subject: { $in: subjectIds },
                        completed: true
                    });

                    const successRate = studentsCount > 0
                        ? (completedStudents.length / studentsCount) * 100
                        : 0;

                    return {
                        category,
                        icon: categoryIcons[category] || 'BookOpen',
                        students: studentsCount,
                        retention: parseFloat(retention.toFixed(1)),
                        satisfaction: parseFloat(satisfaction.toFixed(1)),
                        revenue,
                        details: {
                            activeCourses,
                            teachers: teachersCount,
                            successRate: parseFloat(successRate.toFixed(1))
                        }
                    };
                })
            );

            return departmentStats.sort((a, b) => b.students - a.students);
        },

        // ==========================================
        // 6️⃣ ACTIVITÉ EN TEMPS RÉEL
        // ==========================================
        recentActivity: async (_, { limit = 20 }, context) => {
            const activities = [];

            // 1. Enrollments
            const enrollments = await Transaction.find({
                type: 'SUBJECT_BUY',
                status: 'COMPLETED'
            })
                .sort('-createdAt')
                .limit(limit)
                .populate('student')
                .populate('subject');

            enrollments.forEach(tx => {
                if (tx.student && tx.subject) {
                    activities.push({
                        id: `enrollment_${tx._id}`,
                        type: 'ENROLLMENT',
                        description: `${tx.student.firstName} ${tx.student.lastName} s'est inscrit au cours ${tx.subject.name}`,
                        timestamp: tx.createdAt,
                        user: tx.student,
                        subject: tx.subject,
                        metadata: { amount: tx.amount }
                    });
                }
            });

            // 2. Complétions
            const completions = await VideoProgress.find({
                completed: true,
                completionPercentage: 100
            })
                .sort('-lastWatchedAt')
                .limit(limit)
                .populate({
                    path: 'student',
                    populate: { path: 'user' }
                })
                .populate('subject');

            completions.forEach(progress => {
                if (progress.student?.user && progress.subject) {
                    activities.push({
                        id: `completion_${progress._id}`,
                        type: 'COMPLETION',
                        description: `${progress.student.user.firstName} ${progress.student.user.lastName} a terminé une vidéo du cours ${progress.subject.name}`,
                        timestamp: progress.lastWatchedAt,
                        user: progress.student.user,
                        subject: progress.subject,
                        metadata: { videoId: progress.videoId }
                    });
                }
            });

            // 3. Paiements
            const payments = await Transaction.find({
                type: 'PURCHASE',
                status: 'COMPLETED'
            })
                .sort('-createdAt')
                .limit(limit)
                .populate('student');

            payments.forEach(tx => {
                if (tx.student) {
                    activities.push({
                        id: `payment_${tx._id}`,
                        type: 'PAYMENT',
                        description: `${tx.student.firstName} ${tx.student.lastName} a acheté ${tx.amount}€ de crédits`,
                        timestamp: tx.createdAt,
                        user: tx.student,
                        metadata: { amount: tx.amount }
                    });
                }
            });

            // 4. Retraits
            const withdrawals = await Transaction.find({
                type: 'WITHDRAWAL'
            })
                .sort('-createdAt')
                .limit(limit)
                .populate('teacher');

            withdrawals.forEach(tx => {
                if (tx.teacher) {
                    activities.push({
                        id: `withdrawal_${tx._id}`,
                        type: 'WITHDRAWAL',
                        description: `${tx.teacher.firstName} ${tx.teacher.lastName} a demandé un retrait de ${tx.amount}€`,
                        timestamp: tx.createdAt,
                        user: tx.teacher,
                        metadata: { amount: tx.amount }
                    });
                }
            });

            // 5. Nouveaux cours
            const newSubjects = await Subject.find()
                .sort('-createdAt')
                .limit(limit);

            newSubjects.forEach(subject => {
                activities.push({
                    id: `subject_${subject._id}`,
                    type: 'SUBJECT_CREATED',
                    description: `Nouveau cours créé: ${subject.name}`,
                    timestamp: subject.createdAt,
                    subject: subject,
                    metadata: { price: subject.price }
                });
            });

            // 6. Nouvelles évaluations
            const ratings = await Rating.find()
                .sort('-createdAt')
                .limit(limit)
                .populate({
                    path: 'student',
                    populate: { path: 'user' }
                })
                .populate('subject');

            ratings.forEach(rating => {
                if (rating.student?.user && rating.subject) {
                    activities.push({
                        id: `rating_${rating._id}`,
                        type: 'RATING_SUBMITTED',
                        description: `${rating.student.user.firstName} ${rating.student.user.lastName} a noté ${rating.subject.name} (${rating.rating}/5)`,
                        timestamp: rating.createdAt,
                        user: rating.student.user,
                        subject: rating.subject,
                        metadata: { rating: rating.rating }
                    });
                }
            });

            // Trier par date et limiter
            activities.sort((a, b) => b.timestamp - a.timestamp);
            return activities.slice(0, limit);
        }
    }
};

module.exports = dashboardResolvers;
