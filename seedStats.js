require("dotenv").config();
const db = require("./config/db");

async function seedData() {
  console.log("Seeding dummy statistics data...");
  try {
    // Seed extra students
    console.log("Seeding 3 new dummy students...");
    await db.query(`
      INSERT INTO users (name, email, password_hash, role, enrollment_no, department)
      VALUES 
      ('Alice Johnson', 'alice@example.com', 'dummyhash123', 'student', 'ENR1011', 'Computer Science'),
      ('Bob Smith', 'bob@example.com', 'dummyhash123', 'student', 'ENR1012', 'Electronics'),
      ('Charlie Brown', 'charlie@example.com', 'dummyhash123', 'student', 'ENR1013', 'Mechanical')
      ON CONFLICT (email) DO NOTHING;
    `);

    // Seed extra labs
    console.log("Seeding 3 new dummy labs...");
    await db.query(`
      INSERT INTO labs (name, location, capacity, open_time, close_time)
      SELECT name, location, capacity, open_time::TIME, close_time::TIME FROM (VALUES 
      ('Advanced Computing Lab', 'Building B, Room 204', 40, '09:00', '21:00'),
      ('Physics and Electronics Lab', 'Building C, Room 102', 25, '08:00', '19:00'),
      ('AI & ML Research Center', 'Building A, Room 301', 20, '09:00', '18:00')
      ) AS t(name, location, capacity, open_time, close_time)
      WHERE NOT EXISTS (
        SELECT 1 FROM labs WHERE labs.name = t.name
      );
    `);

    // Check if we have users and labs
    const { rows: users } = await db.query("SELECT id FROM users WHERE role = 'student'");
    const { rows: labs } = await db.query("SELECT id FROM labs");

    if (users.length === 0 || labs.length === 0) {
      console.log("Error: You need at least 1 student and 1 lab in the database to generate stats.");
      process.exit(1);
    }

    let insertedSessions = 0;
    const now = new Date();

    // Generate ~100 random sessions over the past 30 days
    for (let i = 0; i < 100; i++) {
        const student = users[Math.floor(Math.random() * users.length)];
        const lab = labs[Math.floor(Math.random() * labs.length)];
        
        // Random day in the last 30 days
        const daysAgo = Math.floor(Math.random() * 30);
        let checkIn = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
        
        // Random hour for checkin between 9am and 5pm
        const hour = 9 + Math.floor(Math.random() * 8);
        const minute = Math.floor(Math.random() * 60);
        checkIn.setHours(hour, minute, 0, 0);

        // Checkout is 30 to 180 mins later
        const durationMinutes = 30 + Math.floor(Math.random() * 150);
        let checkOut = new Date(checkIn.getTime() + (durationMinutes * 60 * 1000));

        await db.query(
            `INSERT INTO lab_sessions (user_id, lab_id, check_in_time, check_out_time, duration_minutes, status, created_at)
             VALUES ($1, $2, $3, $4, $5, 'completed', $3)`,
            [student.id, lab.id, checkIn, checkOut, durationMinutes]
        );
        insertedSessions++;
    }

    console.log(`Successfully generated ${insertedSessions} dummy completed sessions over the last 30 days!`);
    console.log("You can now view meaningful bar charts and export valid PDF/Excel/CSV reports in the Statistics page.");
    process.exit(0);

  } catch (error) {
    console.error("Failed to seed data:", error);
    process.exit(1);
  }
}

seedData();
