const { gql } = require("graphql-tag");

const typeDefs = gql`
  scalar Date

  type User {
    id: ID!
    email: String!
    firstName: String!
    lastName: String!
    phone: String!
    role: Role!
    status: Status!
    verified: Boolean!
    studentProfile: Student
    teacherProfile: Teacher
    adminProfile: Admin
    createdAt: Date!
  }

  type Student {
    id: ID!
    userId: ID!
    user: User!
    parentName: String!
    educationLevel: EducationLevel!
    currentYear: String
    credit: Float!
    enrolledSubjects: [Subject!]
    createdAt: Date!
  }

  type Teacher {
    id: ID!
    userId: ID!
    user: User!
    subjects: [String!]
    educationLevels: [EducationLevel!]
    credit: Float!
    totalEarnings: Float!
    withdrawable: Float!
    bankInfo: BankInfo
    selectedSubjects: [Subject!]
    ratingsStats: RatingsStats
    createdAt: Date!
  }

  type Admin {
    id: ID!
    userId: ID!
    user: User!
    department: String
    permissions: [String!]
    lastLogin: Date
    createdAt: Date!
  }

  type StudentProfile {
    parentName: String
    educationLevel: EducationLevel
    currentYear: String
    enrolledSubjects: [Subject!]
  }

  type TeacherProfile {
    subjects: [String!]
    educationLevels: [EducationLevel!]
    totalEarnings: Float!
    withdrawable: Float!
    bankInfo: BankInfo
  }

  type AdminProfile {
    permissions: [String!]
    department: String
    lastLogin: Date
  }

  type BankInfo {
    accountHolder: String
    iban: String
    bankName: String
  }

  type ContentStats {
    totalVideos: Int!
    totalPdfs: Int!
    totalDuration: Int!
    totalSize: Int!
  }

  type RatingsStats {
    averageRating: Float!
    totalRatings: Int!
    ratingDistribution: RatingDistribution!
  }

  type RatingDistribution {
    one: Int!
    two: Int!
    three: Int!
    four: Int!
    five: Int!
  }

  type Video {
    id: ID!
    title: String!
    description: String
    url: String!
    publicId: String!
    duration: Int
    fileSize: Int
    format: String
    width: Int
    height: Int
    uploadedBy: Teacher
    uploadedAt: Date!
    order: Int
    price: Float
  }

  type PDF {
    id: ID!
    title: String!
    description: String
    url: String!
    publicId: String!
    fileSize: Int
    pageCount: Int
    uploadedBy: Teacher
    uploadedAt: Date!
  }

  type Subject {
    id: ID!
    name: String!
    description: String!
    price: Float!
    category: String
    level: Level!
    year: String
    status: SubjectStatus!
    assignedTeachers: [AssignedTeacher!]
    enrolledStudents: [EnrolledStudent!]
    stats: SubjectStats!
    videos: [Video!]
    pdfs: [PDF!]
    contentStats: ContentStats
    ratingsStats: RatingsStats
    createdAt: Date!
  }

  type AssignedTeacher {
    teacherId: ID!
    teacher: Teacher!
    userId: ID!
    user: User!
    assignedAt: Date!
  }

  type EnrolledStudent {
    studentId: ID!
    student: Student!
    userId: ID!
    user: User!
    enrolledAt: Date!
    progress: Float!
  }

  type Transaction {
    id: ID!
    student: User
    teacher: User
    subject: Subject
    videoId: ID
    pdfId: ID
    amount: Float!
    type: TransactionType!
    teacherCut: Float!
    companyCut: Float!
    description: String
    status: TransactionStatus!
    createdAt: Date!
  }

  type WatchVideoResult {
    success: Boolean!
    transaction: Transaction
    remainingCredit: Float!
    message: String!
  }

  type Message {
    id: ID!
    sender: User!
    recipient: User!
    subject: Subject
    content: String!
    isRead: Boolean!
    createdAt: Date!
  }

  type SubjectStats {
    totalSales: Int!
    revenue: Float!
    studentsEnrolled: Int!
    teachersCount: Int!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type AIResponse {
    answer: String!
    pointsCharged: Float!
    remainingCredit: Float!
  }

  type DashboardStats {
    totalStudents: Int!
    totalTeachers: Int!
    totalSubjects: Int!
    totalRevenue: Float!
    totalTransactions: Int!
    recentTransactions: [Transaction!]
  }

  type Rating {
    id: ID!
    student: Student!
    studentUserId: ID!
    targetType: RatingTargetType!
    video: ID
    pdf: ID
    subject: Subject
    teacher: Teacher
    rating: Int!
    comment: String
    createdAt: Date!
    updatedAt: Date!
  }

  type VideoProgress {
    id: ID!
    student: Student!
    subject: Subject!
    videoId: ID!
    watchedTime: Int!
    completionPercentage: Float!
    completed: Boolean!
    lastPosition: Int!
    lastWatchedAt: Date!
  }

  type PDFProgress {
    id: ID!
    student: Student!
    subject: Subject!
    pdfId: ID!
    pagesRead: [Int!]!
    lastPage: Int!
    completionPercentage: Float!
    completed: Boolean!
    lastReadAt: Date!
  }

  type SubjectWithProgress {
    subject: Subject!
    overallProgress: Float!
    videosProgress: [VideoProgress!]!
    pdfsProgress: [PDFProgress!]!
    ratings: [Rating!]!
  }

  # ========================================
  # NOUVEAUX TYPES POUR L'INSCRIPTION
  # ========================================
  type RegistrationStepResponse {
    success: Boolean!
    message: String!
    userId: ID!
    step: Int!
  }

  type MessageResponse {
    success: Boolean!
    message: String!
  }

  enum RatingTargetType {
    VIDEO
    PDF
    SUBJECT
    TEACHER
  }

  enum EducationLevel {
    PRIMAIRE
    CEM
    LYCEE
    SUPERIEUR
  }

  enum Role {
    STUDENT
    TEACHER
    ADMIN
    SUPER_ADMIN
    DESKTOP_USER
  }

  enum Status {
    ACTIVE
    INACTIVE
  }

  enum Level {
    PRIMAIRE
    COLLEGE
    LYCEE
    SUPERIEUR
  }

  enum SubjectStatus {
    ACTIVE
    INACTIVE
    DRAFT
  }

  enum TransactionType {
    PURCHASE
    SUBJECT_BUY
    AI_USE
    WITHDRAWAL
    REFUND
    VIDEO_WATCH
    PDF_READ
  }

  enum TransactionStatus {
    PENDING
    COMPLETED
    FAILED
    CANCELLED
  }

  # ========================================
  # NOUVEAUX TYPES POUR DASHBOARD ANALYTICS
  # ========================================

  # KPIs Principaux
  type DashboardKPIs {
    totalEnrollments: KPIMetric!
    retentionRate: KPIMetric!
    totalRevenue: KPIMetric!
    studentSatisfaction: KPIMetric!
  }

  type KPIMetric {
    value: String!           # Valeur formatée (ex: "12,847" ou "92.4%")
    numericValue: Float!     # Valeur numérique brute
    change: Float!           # Pourcentage ou valeur absolue de changement
    changeType: ChangeType!  # Type de changement
    trend: TrendInfo!        # Info sur la tendance
  }

  type TrendInfo {
    direction: TrendDirection!
    description: String!     # Ex: "+1,054 ce mois"
  }

  enum TrendDirection {
    UP
    DOWN
    STABLE
  }

  enum ChangeType {
    POSITIVE
    NEGATIVE
    NEUTRAL
  }

  # Tendances mensuelles
  type MonthlyTrend {
    month: String!           # "Jan", "Fév", etc.
    year: Int!
    enrollment: Int!         # Nouveaux inscrits
    completion: Float!       # % moyen de complétion
    revenue: Float!          # Revenus en K€
  }

  # Top cours
  type TopCourse {
    id: ID!
    name: String!
    studentsCount: Int!
    averageRating: Float!
    status: PerformanceStatus!
    revenue: Float!
  }

  enum PerformanceStatus {
    HIGH
    MEDIUM
    LOW
  }

  # Étudiants à risque
  type AtRiskCourse {
    subjectId: ID!
    subjectName: String!
    studentsAtRisk: Int!
    severity: RiskSeverity!
  }

  enum RiskSeverity {
    HIGH
    MEDIUM
    LOW
  }

  # Performance par département
  type DepartmentPerformance {
    category: String!        # Nom du département
    icon: String!            # Nom de l'icône
    students: Int!
    retention: Float!        # Pourcentage
    satisfaction: Float!     # Pourcentage
    revenue: Float!
    details: DepartmentDetails!
  }

  type DepartmentDetails {
    activeCourses: Int!
    teachers: Int!
    successRate: Float!      # Pourcentage
  }

  # Activité en temps réel
  type ActivityEvent {
    id: ID!
    type: ActivityType!
    description: String!
    timestamp: Date!
    user: User
    subject: Subject
    metadata: JSON
  }

  scalar JSON

  enum ActivityType {
    ENROLLMENT
    COMPLETION
    PAYMENT
    WITHDRAWAL
    SUBJECT_CREATED
    RATING_SUBMITTED
  }

  # Input pour filtrer par date
  input DateRangeInput {
    startDate: Date
    endDate: Date
  }

  # ========================================
  # NOUVEAUX TYPES POUR STUDENT ANALYTICS
  # ========================================

  # KPIs Étudiants
  type StudentAnalyticsKPIs {
    activeStudents: StudentKPIMetric!
    successRate: StudentKPIMetric!
    retentionRate: StudentKPIMetric!
    atRiskCount: StudentKPIMetric!
    averageGrade: StudentKPIMetric!
    attendanceRate: StudentKPIMetric!
  }

  type StudentKPIMetric {
    value: String!
    numericValue: Float!
    change: Float!
    changeType: ChangeType!
    description: String!
  }

  # Funnel de progression
  type ProgressionFunnelData {
    stage: String!
    count: Int!
    percentage: Float!
    dropoffRate: Float!
  }

  # Heatmap d'engagement
  type EngagementHeatmapData {
    dayOfWeek: Int!
    hour: Int!
    activityCount: Int!
    intensity: String!
  }

  # Étudiant à risque (individuel)
  type AtRiskStudentDetail {
    studentId: ID!
    firstName: String!
    lastName: String!
    email: String!
    enrolledCourses: Int!
    averageProgress: Float!
    lastActivity: Date
    riskLevel: RiskLevel!
    riskFactors: [String!]!
  }

  enum RiskLevel {
    CRITICAL
    HIGH
    MEDIUM
    LOW
  }

  # Performance d'un étudiant
  type StudentPerformance {
    studentId: ID!
    firstName: String!
    lastName: String!
    email: String!
    educationLevel: EducationLevel!
    enrolledCourses: Int!
    completedCourses: Int!
    averageProgress: Float!
    averageGrade: Float!
    lastActivity: Date
    status: Status!
  }

  input StudentFiltersInput {
    educationLevel: EducationLevel
    status: Status
    minProgress: Float
    maxProgress: Float
    riskLevel: RiskLevel
  }

  type StudentPerformanceListResponse {
    students: [StudentPerformance!]!
    total: Int!
    hasMore: Boolean!
  }

  # ========================================
  # TYPES POUR MÉMORISATION IA
  # ========================================

  type MemoryPDF {
    url: String!
    publicId: String!
    fileName: String!
    fileSize: Int
    pageCount: Int
    extractedText: String
    uploadedAt: Date
  }

  type VoiceRecord {
    id: ID!
    url: String!
    duration: Int
    transcription: String
    transcribedAt: Date
    recordedAt: Date
  }

  type MemoryQuestion {
    id: ID!
    questionText: String!
    type: QuestionType!
    options: [String]
    correctAnswer: String
    topic: String
    difficulty: DifficultyLevel!
    isLacune: Boolean!
    explanation: String
  }

  type MemoryAnswer {
    id: ID!
    questionId: ID!
    questionText: String
    answerText: String
    isCorrect: Boolean
    scoreObtained: Float
    aiFeedback: String
    hint: String
    answeredAt: Date
  }

  type Lacune {
    topic: String!
    description: String
    severity: LacuneSeverity!
  }

  type MemorySessionStats {
    totalQuestions: Int!
    answeredQuestions: Int!
    correctAnswers: Int!
    globalScore: Float!
    lacunesCount: Int!
    timeSpent: Int!
  }

  type MemoryAIMeta {
    pdfAnalyzedAt: Date
    questionsGeneratedAt: Date
    totalTokensUsed: Int
    claudeTokens: Int
    geminiTokens: Int
  }

  type MemorySession {
    id: ID!
    studentId: ID!
    userId: ID!
    title: String!
    status: MemorySessionStatus!
    pdf: MemoryPDF!
    voiceRecords: [VoiceRecord!]
    questions: [MemoryQuestion!]
    answers: [MemoryAnswer!]
    lacunes: [Lacune!]
    stats: MemorySessionStats!
    aiMeta: MemoryAIMeta
    startedAt: Date
    completedAt: Date
    createdAt: Date!
    updatedAt: Date!
  }

  type GlobalMemoryStats {
    totalSessions: Int!
    completedSessions: Int!
    averageScore: Float!
    totalTimeSpent: Int!
    mostMissedTopics: [String!]!
  }

  enum MemorySessionStatus {
    created
    analyzed
    in_progress
    completed
    failed
  }

  enum QuestionType {
    open
    mcq
    true_false
  }

  enum DifficultyLevel {
    easy
    medium
    hard
  }

  enum LacuneSeverity {
    low
    medium
    high
  }

  type MySubjectsResult {
    hasEnrolled: Boolean!
    enrolledSubjects: [Subject!]!
    availableSubjects: [Subject!]!
    studentLevel: EducationLevel
    studentYear: String
  }


  type Query {
    # Auth
    me: User
    myProfile: ProfileUnion

    # Users
    users(role: Role, status: Status): [User!]!
    user(id: ID!): User

    # Students
    students: [Student!]!
    student(id: ID!): Student


    # Teachers
    teachers: [Teacher!]!
    teacher(id: ID!): Teacher

    # Admins
    admins: [Admin!]!
    admin(id: ID!): Admin

    # Subjects
    subjects(teacherId: ID, level: Level, status: SubjectStatus): [Subject!]!
    subject(id: ID!): Subject
    mySubjects: MySubjectsResult!
    myPurchasedSubjects: [Subject!]!

    # Transactions
    myTransactions: [Transaction!]!
    userTransactions(userId: ID!): [Transaction!]!
    allTransactions(type: TransactionType): [Transaction!]!

    # Messages
    myMessages(recipientId: ID): [Message!]!
    conversation(userId: ID!): [Message!]!

    # Stats
    dashboardStats: DashboardStats!
    teacherEarnings: Float!

    # Progression
    myProgress: [SubjectWithProgress!]!
    subjectProgress(subjectId: ID!): SubjectWithProgress

    # Évaluations
    subjectRatings(subjectId: ID!): [Rating!]!
    teacherRatings(teacherId: ID!): [Rating!]!
    myRatings: [Rating!]!

    # Accès vidéo
    hasAccessToVideo(subjectId: ID!, videoId: ID!): Boolean!
    
    # ========================================
    # NOUVELLES QUERIES DASHBOARD
    # ========================================
    # KPIs Dashboard
    dashboardKPIs(dateRange: DateRangeInput): DashboardKPIs!
    
    # Tendances
    monthlyTrends(months: Int): [MonthlyTrend!]!
    
    # Top & Bottom
    topPerformingCourses(limit: Int): [TopCourse!]!
    atRiskStudents(limit: Int): [AtRiskCourse!]!
    
    # Départements
    departmentPerformance: [DepartmentPerformance!]!
    
    # Activité
    recentActivity(limit: Int): [ActivityEvent!]!

    # ========================================
    # NOUVELLES QUERIES STUDENT ANALYTICS
    # ========================================
    # KPIs
    studentAnalyticsKPIs(dateRange: DateRangeInput): StudentAnalyticsKPIs!

    # Funnel de progression
    studentProgressionFunnel: [ProgressionFunnelData!]!

    # Heatmap d'engagement
    studentEngagementHeatmap(dateRange: DateRangeInput): [EngagementHeatmapData!]!

    # Liste détaillée des étudiants à risque
    atRiskStudentsList(limit: Int, riskLevel: RiskLevel): [AtRiskStudentDetail!]!

    # Tableau de performance de tous les étudiants
    studentPerformanceList(
      limit: Int
      offset: Int
      orderBy: String
      filters: StudentFiltersInput
    ): StudentPerformanceListResponse!

    # ========================================
    # MÉMORISATION IA
    # ========================================
    myMemorySessions(status: MemorySessionStatus, limit: Int, offset: Int): [MemorySession!]!
    memorySession(sessionId: ID!): MemorySession
    memoryStats: GlobalMemoryStats!
  }

  union ProfileUnion = Student | Teacher | Admin

  type Mutation {
    # ========================================
    # INSCRIPTION EN 3 ÉTAPES
    # ========================================
    
    # ÉTAPE 1/3: Informations personnelles Student
    registerStudentStep1(
      firstName: String!
      lastName: String!
      phone: String!
      parentName: String!
      educationLevel: EducationLevel!
      currentYear: String
    ): RegistrationStepResponse!
    
    # ÉTAPE 1/3: Informations personnelles Teacher
    registerTeacherStep1(
      firstName: String!
      lastName: String!
      phone: String!
      subjects: [String!]
      educationLevels: [EducationLevel!]
    ): RegistrationStepResponse!
    
    # ÉTAPE 2/3: Création du compte (email + password)
    registerStep2(
      userId: ID!
      email: String!
      password: String!
      confirmedPassword: String!
    ): RegistrationStepResponse!
    
    # ÉTAPE 3/3: Vérification du code
    verifyRegistrationCode(
      userId: ID!
      code: String!
    ): AuthPayload!
    
    # Renvoyer le code de vérification
    resendVerificationCode(userId: ID!): MessageResponse!

    # ========================================
    # Auth (ancienne méthode - à garder pour compatibilité)
    # ========================================
    register(
      email: String!
      password: String!
      firstName: String!
      lastName: String!
      phone: String!
      role: Role!
    ): AuthPayload!

    login(email: String!, password: String!): AuthPayload!

    # Create Profiles
    createStudentProfile(
      userId: ID!
      parentName: String!
      educationLevel: EducationLevel!
      currentYear: String
    ): Student!

    createTeacherProfile(
      userId: ID!
      subjects: [String!]
      educationLevels: [EducationLevel!]
      selectedSubjects: [ID!]
    ): Teacher!

    createAdminProfile(
      userId: ID!
      department: String
      permissions: [String!]
    ): Admin!

    # User management
    updateUser(
      id: ID!
      firstName: String
      lastName: String
      phone: String
      status: Status
    ): User!

    updateCredit(userId: ID!, amount: Float!): User!

    # Points
    purchasePoints(amount: Float!): Transaction!

    # Subjects
    createSubject(
      name: String!
      description: String!
      price: Float!
      category: String
      level: Level!
      year: String
    ): Subject!

    updateSubject(
      id: ID!
      name: String
      description: String
      price: Float
      level: Level
      year: String
      status: SubjectStatus
    ): Subject!

    deleteSubject(id: ID!): Boolean!

    assignTeacherToSubject(subjectId: ID!, teacherId: ID!): Subject!
    removeTeacherFromSubject(subjectId: ID!, teacherId: ID!): Subject!

    buySubject(subjectId: ID!): Transaction!

    # Video payment
    watchVideo(subjectId: ID!, videoId: ID!): WatchVideoResult!
    updateVideoPrice(subjectId: ID!, videoId: ID!, price: Float!): Subject!

    # Content
    deleteVideo(subjectId: ID!, videoId: ID!): Subject!
    deletePDF(subjectId: ID!, pdfId: ID!): Subject!
    updateStudentProfile(
      currentYear: String
      educationLevel: EducationLevel
      parentName: String
    ): Student!

    # Progression
    updateVideoProgress(
      subjectId: ID!
      videoId: ID!
      watchedTime: Int!
      lastPosition: Int!
    ): VideoProgress!

    updatePDFProgress(
      subjectId: ID!
      pdfId: ID!
      pagesRead: [Int!]!
      lastPage: Int!
    ): PDFProgress!

    # Évaluations
    rateVideo(
      subjectId: ID!
      videoId: ID!
      rating: Int!
      comment: String
    ): Rating!

    ratePDF(subjectId: ID!, pdfId: ID!, rating: Int!, comment: String): Rating!

    rateSubject(subjectId: ID!, rating: Int!, comment: String): Rating!

    rateTeacher(teacherId: ID!, rating: Int!, comment: String): Rating!

    updateRating(ratingId: ID!, rating: Int!, comment: String): Rating!

    deleteRating(ratingId: ID!): Boolean!

    # Messages
    sendMessage(recipientId: ID!, subjectId: ID, content: String!): Message!

    markMessageAsRead(id: ID!): Message!

    # Withdrawal
    requestWithdrawal(amount: Float!): Transaction!
    
    # Admin Actions
    toggleUserStatus(userId: ID!): User!
    
    createAdminUser(
      email: String!
      password: String!
      firstName: String!
      lastName: String!
      phone: String!
      department: String
      permissions: [String!]
    ): AuthPayload!

    # ========================================
    # MÉMORISATION IA
    # ========================================
    createMemorySession(
      title: String
      pdfUrl: String!
      pdfPublicId: String!
      fileName: String!
      fileSize: Int
      audioUrl: String!
      audioPublicId: String!
      audioDuration: Int
    ): MemorySession!

    addVoiceRecord(
      sessionId: ID!
      audioUrl: String!
      audioPublicId: String!
      audioDuration: Int
    ): MemorySession!

    submitAnswer(
      sessionId: ID!
      questionId: ID!
      answerText: String
      answerVoiceUrl: String
    ): MemorySession!

    deleteMemorySession(sessionId: ID!): Boolean!
  }
`;

module.exports = typeDefs;