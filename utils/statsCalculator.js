/**
 * Fonctions utilitaires pour les calculs statistiques
 */

/**
 * Calcule le pourcentage de changement entre deux valeurs
 * @param {number} current - Valeur actuelle
 * @param {number} previous - Valeur précédente
 * @returns {number} Pourcentage de changement
 */
const calculateChange = (current, previous) => {
    if (!previous || previous === 0) return 0;
    const change = ((current - previous) / previous) * 100;
    return parseFloat(change.toFixed(1));
};

/**
 * Obtient la période précédente de même durée
 * @param {Date} startDate - Date de début
 * @param {Date} endDate - Date de fin
 * @returns {Object} Période précédente {start, end}
 */
const getPreviousPeriod = (startDate, endDate) => {
    const duration = endDate - startDate;
    return {
        start: new Date(startDate.getTime() - duration),
        end: startDate
    };
};

/**
 * Obtient la plage de dates par défaut (30 derniers jours)
 * @returns {Object} {startDate, endDate}
 */
const getDefaultDateRange = () => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    return { startDate, endDate };
};

/**
 * Formate un nombre avec séparateurs de milliers
 * @param {number} num - Nombre à formater
 * @returns {string} Nombre formaté
 */
const formatNumber = (num) => {
    return new Intl.NumberFormat('fr-FR').format(num);
};

/**
 * Formate une devise en euros
 * @param {number} amount - Montant
 * @returns {string} Montant formaté (ex: "2.4M €" ou "580k €")
 */
const formatCurrency = (amount) => {
    if (amount >= 1000000) {
        return `${(amount / 1000000).toFixed(1)}M €`;
    } else if (amount >= 1000) {
        return `${(amount / 1000).toFixed(0)}k €`;
    } else {
        return `${amount.toFixed(0)} €`;
    }
};

module.exports = {
    calculateChange,
    getPreviousPeriod,
    getDefaultDateRange,
    formatNumber,
    formatCurrency
};
