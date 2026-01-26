import { connectDB } from './connection';
import { User } from '../models/User';

/**
 * Create an admin user for initial system setup
 * Run this script once to create the first admin user
 */
export async function createAdminUser() {
  try {
    await connectDB();

    // Check if admin user already exists
    const existingAdmin = await User.findOne({
      role: 'Super Admin',
      email: 'admin@varuni.com'
    });

    if (existingAdmin) {
      console.log('✅ Admin user already exists');
      return existingAdmin;
    }

    // Create admin user
    const adminUser = new User({
      name: 'System Administrator',
      email: 'admin@varuni.com',
      password: 'Admin@123!', // Will be hashed by pre-save hook
      role: 'Super Admin',
      permissions: ['dashboard', 'scheduling', 'inventory', 'invoicing', 'team', 'analytics', 'settings', 'admin'],
      isActive: true
    });

    await adminUser.save();

    console.log('✅ Admin user created successfully');
    console.log('📧 Email: admin@varuni.com');
    console.log('🔑 Password: Admin@123!');
    console.log('⚠️  Please change the password after first login');

    return adminUser;

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    throw error;
  }
}

/**
 * Create additional test users for development
 */
export async function createTestUsers() {
  try {
    await connectDB();

    const testUsers = [
      {
        name: 'Restaurant Manager',
        email: 'manager@varuni.com',
        password: 'Manager@123!',
        role: 'Manager',
        permissions: ['dashboard', 'scheduling', 'inventory', 'invoicing', 'team', 'analytics', 'settings']
      },
      {
        name: 'Shift Supervisor',
        email: 'supervisor@varuni.com',
        password: 'Supervisor@123!',
        role: 'Shift Supervisor',
        permissions: ['dashboard', 'scheduling', 'team']
      },
      {
        name: 'Staff Member',
        email: 'staff@varuni.com',
        password: 'Staff@123!',
        role: 'Staff',
        permissions: ['dashboard']
      }
    ];

    const createdUsers: any[] = [];

    for (const userData of testUsers) {
      const existingUser = await User.findOne({ email: userData.email });

      if (!existingUser) {
        const user = new User(userData);
        await user.save();
        createdUsers.push(user);
        console.log(`✅ Created user: ${userData.name} (${userData.email})`);
      } else {
        console.log(`⏭️  User already exists: ${userData.email}`);
      }
    }

    if (createdUsers.length > 0) {
      console.log('\n📝 Test Users Created:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('👤 manager@varuni.com    / Manager@123!');
      console.log('👤 supervisor@varuni.com / Supervisor@123!');
      console.log('👤 staff@varuni.com      / Staff@123!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️  Please change passwords after first login');
    }

    return createdUsers;

  } catch (error) {
    console.error('❌ Error creating test users:', error);
    throw error;
  }
}

// Allow running this script directly
if (require.main === module) {
  async function main() {
    try {
      console.log('🚀 Setting up authentication system...\n');

      await createAdminUser();
      console.log('');
      await createTestUsers();

      console.log('\n✅ Authentication setup complete!');
      console.log('\n🔐 You can now login with any of the created users');
      console.log('🌐 Visit: http://localhost:3000/login');

      process.exit(0);
    } catch (error) {
      console.error('\n❌ Setup failed:', error);
      process.exit(1);
    }
  }

  main();
} 