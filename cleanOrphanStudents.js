const mongoose = require('mongoose');
const Student = require('./models/Student');
const User = require('./models/User');
require('dotenv').config();

async function cleanOrphanStudents() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const students = await Student.find().populate('userId');

        let deleted = 0;
        for (const student of students) {
            if (!student.userId) {
                console.log('Suppression étudiant orphelin:', student._id);
                await Student.findByIdAndDelete(student._id);
                deleted++;
            }
        }

        console.log(`✅ ${deleted} étudiants orphelins supprimés`);
        process.exit(0);
    } catch (err) {
        console.error('Erreur lors du nettoyage:', err);
        process.exit(1);
    }
}

cleanOrphanStudents();
