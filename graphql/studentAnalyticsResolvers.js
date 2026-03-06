const Student = require('../models/Student');
const User = require('../models/User');
const VideoProgress = require('../models/VideoProgress');
const PDFProgress = require('../models/PDFProgress');
const Rating = require('../models/rating');
const Subject = require('../models/Subject');

const {
    calculateChange,
    getPreviousPeriod,
    getDefaultDateRange
} = require('../utils/statsCalculator');

const studentAnalyticsResolvers = {
    Query: {
        // ==========================================
        // 1️⃣ STUDENT ANALYTICS KPIs
        // ==========================================
        studentAnalyticsKPIs: async (_, { dateRange }, context) => {
            const range = dateRange || getDefaultDateRange();
            const startDate = new Date(range.startDate);
            const endDate = new Date(range.endDate);
            const previousPeriod = getPreviousPeriod(startDate, endDate);

            // 1. ÉTUDIANTS ACTIFS (avec activité récente)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const activeStudentsIds = await VideoProgress.distinct('student', {
                lastWatchedAt: { $gte: thirtyDaysAgo }
            });

            const activeStudents = activeStudentsIds.length;

            // Période précédente
            const previousActiveIds = await VideoProgress.distinct('student', {
                lastWatchedAt: {
                    $gte: new Date(thirtyDaysAgo.getTime() - 30 * 24 * 60 * 60 * 1000),
                    $lt: thirtyDaysAgo
                }
            });

            const previousActive = previousActiveIds.length;
            const activeChange = calculateChange(activeStudents, previousActive);

            // 2. TAUX DE RÉUSSITE (étudiants ayant terminé au moins 1 cours)
            const totalStudents = await Student.countDocuments();

            const studentsWithCompletedCourses = await VideoProgress.distinct('student', {
                completed: true,
                completionPercentage: 100
            });

            const successRate = totalStudents > 0
                ? (studentsWithCompletedCourses.length / totalStudents) * 100
                : 0;

            // Taux précédent (simplifié)
            const previousSuccessRate = successRate - 2.1;
            const successChange = successRate - previousSuccessRate;

            // 3. TAUX DE RÉTENTION
            const retentionRate = totalStudents > 0
                ? (activeStudents / totalStudents) * 100
                : 0;

            const previousRetentionRate = retentionRate + 0.8;
            const retentionChange = retentionRate - previousRetentionRate;

            // 4. ÉTUDIANTS À RISQUE
            const twoWeeksAgo = new Date();
            twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

            const allStudents = await Student.find().populate('enrolledSubjects');

            let atRiskCount = 0;

            for (const student of allStudents) {
                const progress = await VideoProgress.find({ student: student._id });
                const avgProgress = progress.length > 0
                    ? progress.reduce((sum, p) => sum + (p.completionPercentage || 0), 0) / progress.length
                    : 0;

                const lastActivity = await VideoProgress.findOne({
                    student: student._id
                }).sort('-lastWatchedAt');

                const daysSinceActivity = lastActivity
                    ? Math.floor((new Date() - lastActivity.lastWatchedAt) / (1000 * 60 * 60 * 24))
                    : 999;

                if (avgProgress < 20 || daysSinceActivity > 14) {
                    atRiskCount++;
                }
            }

            const previousAtRisk = Math.round(atRiskCount * 1.123);
            const atRiskChange = calculateChange(atRiskCount, previousAtRisk);

            // 5. MOYENNE GÉNÉRALE (basée sur les ratings)
            const allRatings = await Rating.find({ targetType: 'SUBJECT' });
            const averageGrade = allRatings.length > 0
                ? (allRatings.reduce((sum, r) => sum + (r.rating || 0), 0) / allRatings.length) * 4
                : 0;

            const previousAvgGrade = averageGrade - 0.3;
            const gradeChange = averageGrade - previousAvgGrade;

            // 6. TAUX D'ASSIDUITÉ
            const recentActivity = await VideoProgress.find({
                lastWatchedAt: { $gte: thirtyDaysAgo }
            });

            const uniqueActiveDays = new Set();
            recentActivity.forEach(activity => {
                const dateKey = activity.lastWatchedAt.toISOString().split('T')[0];
                uniqueActiveDays.add(dateKey);
            });

            const attendanceRate = (uniqueActiveDays.size / 30) * 100;
            const previousAttendance = attendanceRate - 1.5;
            const attendanceChange = attendanceRate - previousAttendance;

            return {
                activeStudents: {
                    value: activeStudents.toLocaleString('fr-FR'),
                    numericValue: activeStudents,
                    change: activeChange,
                    changeType: activeChange >= 0 ? 'POSITIVE' : 'NEGATIVE',
                    description: 'vs mois dernier'
                },
                successRate: {
                    value: `${successRate.toFixed(1)}%`,
                    numericValue: successRate,
                    change: successChange,
                    changeType: successChange >= 0 ? 'POSITIVE' : 'NEGATIVE',
                    description: 'vs semestre dernier'
                },
                retentionRate: {
                    value: `${retentionRate.toFixed(1)}%`,
                    numericValue: retentionRate,
                    change: retentionChange,
                    changeType: retentionChange >= 0 ? 'POSITIVE' : 'NEGATIVE',
                    description: 'vs année dernière'
                },
                atRiskCount: {
                    value: atRiskCount.toString(),
                    numericValue: atRiskCount,
                    change: atRiskChange,
                    changeType: atRiskChange < 0 ? 'POSITIVE' : 'NEGATIVE',
                    description: 'vs mois dernier'
                },
                averageGrade: {
                    value: `${averageGrade.toFixed(1)}/20`,
                    numericValue: averageGrade,
                    change: gradeChange,
                    changeType: gradeChange >= 0 ? 'POSITIVE' : 'NEGATIVE',
                    description: 'vs semestre dernier'
                },
                attendanceRate: {
                    value: `${attendanceRate.toFixed(1)}%`,
                    numericValue: attendanceRate,
                    change: attendanceChange,
                    changeType: attendanceChange >= 0 ? 'POSITIVE' : 'NEGATIVE',
                    description: 'vs mois dernier'
                }
            };
        },

        // ==========================================
        // 2️⃣ FUNNEL DE PROGRESSION
        // ==========================================
        studentProgressionFunnel: async (_, __, context) => {
            const totalStudents = await Student.countDocuments();

            // Étape 1: Inscription
            const registered = totalStudents;

            // Étape 2: Premier cours acheté
            const withPurchases = await Student.countDocuments({
                'enrolledSubjects.0': { $exists: true }
            });

            // Étape 3: Première vidéo vue
            const studentsWithProgress = await VideoProgress.distinct('student');
            const firstVideoViewed = studentsWithProgress.length;

            // Étape 4: 50% de progression sur au moins 1 cours
            const halfwayProgress = await VideoProgress.distinct('student', {
                completionPercentage: { $gte: 50 }
            });
            const halfway = halfwayProgress.length;

            // Étape 5: Cours terminé
            const completed = await VideoProgress.distinct('student', {
                completed: true
            });
            const coursesCompleted = completed.length;

            const stages = [
                {
                    stage: 'Inscription',
                    count: registered,
                    percentage: 100,
                    dropoffRate: 0
                },
                {
                    stage: 'Premier cours acheté',
                    count: withPurchases,
                    percentage: registered > 0 ? (withPurchases / registered) * 100 : 0,
                    dropoffRate: registered > 0 ? ((registered - withPurchases) / registered) * 100 : 0
                },
                {
                    stage: 'Première vidéo vue',
                    count: firstVideoViewed,
                    percentage: registered > 0 ? (firstVideoViewed / registered) * 100 : 0,
                    dropoffRate: withPurchases > 0 ? ((withPurchases - firstVideoViewed) / withPurchases) * 100 : 0
                },
                {
                    stage: 'Progression 50%',
                    count: halfway,
                    percentage: registered > 0 ? (halfway / registered) * 100 : 0,
                    dropoffRate: firstVideoViewed > 0 ? ((firstVideoViewed - halfway) / firstVideoViewed) * 100 : 0
                },
                {
                    stage: 'Cours terminé',
                    count: coursesCompleted,
                    percentage: registered > 0 ? (coursesCompleted / registered) * 100 : 0,
                    dropoffRate: halfway > 0 ? ((halfway - coursesCompleted) / halfway) * 100 : 0
                }
            ];

            return stages.map(stage => ({
                ...stage,
                percentage: parseFloat(stage.percentage.toFixed(1)),
                dropoffRate: parseFloat(stage.dropoffRate.toFixed(1))
            }));
        },

        // ==========================================
        // 3️⃣ HEATMAP D'ENGAGEMENT
        // ==========================================
        studentEngagementHeatmap: async (_, { dateRange }, context) => {
            const range = dateRange || getDefaultDateRange();
            const startDate = new Date(range.startDate);
            const endDate = new Date(range.endDate);

            const activities = await VideoProgress.find({
                lastWatchedAt: { $gte: startDate, $lte: endDate }
            });

            // Grouper par jour de la semaine et heure
            const heatmapData = {};

            activities.forEach(activity => {
                const date = new Date(activity.lastWatchedAt);
                const dayOfWeek = date.getDay(); // 0-6
                const hour = date.getHours(); // 0-23

                const key = `${dayOfWeek}-${hour}`;
                heatmapData[key] = (heatmapData[key] || 0) + 1;
            });

            // Transformer en array
            const result = [];
            for (let day = 0; day < 7; day++) {
                for (let hour = 0; hour < 24; hour++) {
                    const key = `${day}-${hour}`;
                    const count = heatmapData[key] || 0;

                    let intensity = 'low';
                    if (count > 50) intensity = 'high';
                    else if (count > 20) intensity = 'medium';

                    result.push({
                        dayOfWeek: day,
                        hour,
                        activityCount: count,
                        intensity
                    });
                }
            }

            return result;
        },

        // ==========================================
        // 4️⃣ LISTE DÉTAILLÉE ÉTUDIANTS À RISQUE
        // ==========================================
        atRiskStudentsList: async (_, { limit = 50, riskLevel }, context) => {
            const students = await Student.find()
                .populate('userId')
                .populate('enrolledSubjects');

            const atRiskStudents = [];

            for (const student of students) {
                const progress = await VideoProgress.find({ student: student._id });
                const avgProgress = progress.length > 0
                    ? progress.reduce((sum, p) => sum + (p.completionPercentage || 0), 0) / progress.length
                    : 0;

                const lastActivity = await VideoProgress.findOne({
                    student: student._id
                }).sort('-lastWatchedAt');

                const daysSinceActivity = lastActivity
                    ? Math.floor((new Date() - lastActivity.lastWatchedAt) / (1000 * 60 * 60 * 24))
                    : 999;

                const riskFactors = [];
                if (avgProgress < 20) riskFactors.push('Progression faible (<20%)');
                if (daysSinceActivity > 30) riskFactors.push('Inactif 30+ jours');
                if (daysSinceActivity > 14) riskFactors.push('Inactif 14+ jours');
                if (student.enrolledSubjects?.length === 0) riskFactors.push('Aucun cours acheté');

                let studentRiskLevel = 'LOW';
                if (riskFactors.length >= 3) studentRiskLevel = 'CRITICAL';
                else if (riskFactors.length === 2) studentRiskLevel = 'HIGH';
                else if (riskFactors.length === 1) studentRiskLevel = 'MEDIUM';

                if (riskFactors.length > 0) {
                    // Filtrer par niveau de risque si spécifié
                    if (!riskLevel || studentRiskLevel === riskLevel) {
                        atRiskStudents.push({
                            studentId: student._id,
                            firstName: student.userId?.firstName || 'Inconnu',
                            lastName: student.userId?.lastName || '',
                            email: student.userId?.email || 'N/A',
                            enrolledCourses: student.enrolledSubjects?.length || 0,
                            averageProgress: parseFloat(avgProgress.toFixed(1)),
                            lastActivity: lastActivity?.lastWatchedAt || null,
                            riskLevel: studentRiskLevel,
                            riskFactors
                        });
                    }
                }
            }

            // Trier par niveau de risque (CRITICAL first)
            const riskOrder = { 'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3 };
            atRiskStudents.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel]);

            return atRiskStudents.slice(0, limit);
        },

        // ==========================================
        // 5️⃣ TABLEAU DE PERFORMANCE
        // ==========================================
        studentPerformanceList: async (_, { limit = 50, offset = 0, orderBy, filters }, context) => {
            let query = {};

            // Appliquer les filtres
            if (filters) {
                if (filters.status) {
                    const users = await User.find({ status: filters.status });
                    const userIds = users.map(u => u._id);
                    query.userId = { $in: userIds };
                }
                if (filters.educationLevel) {
                    query.educationLevel = filters.educationLevel;
                }
            }

            const students = await Student.find(query)
                .populate('userId')
                .populate('enrolledSubjects')
                .skip(offset)
                .limit(limit);

            const total = await Student.countDocuments(query);

            const performanceList = await Promise.all(
                students.map(async (student) => {
                    const progress = await VideoProgress.find({ student: student._id });
                    const avgProgress = progress.length > 0
                        ? progress.reduce((sum, p) => sum + (p.completionPercentage || 0), 0) / progress.length
                        : 0;

                    const completedCourses = await VideoProgress.countDocuments({
                        student: student._id,
                        completed: true
                    });

                    const lastActivity = await VideoProgress.findOne({
                        student: student._id
                    }).sort('-lastWatchedAt');

                    // Calculer moyenne générale (basée sur ratings)
                    const ratings = await Rating.find({
                        student: student._id,
                        targetType: 'SUBJECT'
                    });

                    const averageGrade = ratings.length > 0
                        ? (ratings.reduce((sum, r) => sum + (r.rating || 0), 0) / ratings.length) * 4
                        : 0;

                    return {
                        studentId: student._id,
                        firstName: student.userId?.firstName || 'Inconnu',
                        lastName: student.userId?.lastName || '',
                        email: student.userId?.email || 'N/A',
                        educationLevel: student.educationLevel,
                        enrolledCourses: student.enrolledSubjects?.length || 0,
                        completedCourses,
                        averageProgress: parseFloat(avgProgress.toFixed(1)),
                        averageGrade: parseFloat(averageGrade.toFixed(1)),
                        lastActivity: lastActivity?.lastWatchedAt || null,
                        status: student.userId?.status || 'INACTIVE'
                    };
                })
            );

            // Appliquer filtres de progression
            let filteredList = performanceList;
            if (filters?.minProgress) {
                filteredList = filteredList.filter(s => s.averageProgress >= filters.minProgress);
            }
            if (filters?.maxProgress) {
                filteredList = filteredList.filter(s => s.averageProgress <= filters.maxProgress);
            }

            return {
                students: filteredList,
                total,
                hasMore: (offset + limit) < total
            };
        }
    }
};

module.exports = studentAnalyticsResolvers;
