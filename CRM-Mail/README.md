# Conference CRM - Enterprise Email Management System

A comprehensive Customer Relationship Management (CRM) system designed for conference management, email automation, and client communication. This application provides real-time email synchronization with Gmail/IMAP, automated follow-up sequences, template management, and advanced analytics.

## 🚀 Features

- **Email Management**
  - Real-time IMAP/Gmail synchronization
  - Rich text email composer with ReactQuill
  - Compose, send, and manage emails
  - Draft management with auto-save
  - Email threading and conversation view
  - Attachment support
  - Multiple SMTP account management

- **Client Management**
  - Comprehensive client profiles
  - Client status tracking
  - Bulk client import/export
  - Client notes and task management
  - Advanced filtering and search
  - Conference-based client organization

- **Conference Management**
  - Create and manage conferences
  - Conference-specific client assignments
  - Revenue tracking
  - Conference analytics
  - Template associations

- **Email Templates**
  - Rich text email templates with variable substitution
  - Template sequences for follow-ups
  - Draft auto-save functionality
  - Template variables: {Name}, {ConferenceName}, {Email}, {Country}

- **Follow-up Automation**
  - Automated email sequences
  - Smart scheduling with custom intervals
  - Working hours configuration
  - Follow-up tracking and analytics
  - Pause/resume functionality

- **User Management**
  - Role-based access control (CEO, TeamLead, Member)
  - User authentication and authorization
  - Password management
  - Activity tracking
  - Organization-based access

- **Dashboard & Analytics**
  - Real-time metrics
  - Email statistics
  - Client conversion tracking
  - Revenue reports
  - Conference-specific dashboards

- **Real-time Updates**
  - WebSocket integration
  - Live email synchronization
  - Real-time notifications
  - Instant UI updates

## 🛠️ Tech Stack

### Frontend
- **React 18** - Modern UI framework
- **React Router v6** - Client-side routing
- **React Query v3** - Data fetching and caching
- **Tailwind CSS** - Utility-first styling
- **Socket.io Client** - Real-time communication
- **React Quill** - Rich text editor for email composition
- **Axios** - HTTP client
- **React Hot Toast** - User notifications
- **Headless UI** - Accessible UI components
- **Lucide React** - Icon library

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **PostgreSQL** - Relational database
- **Sequelize** - ORM for database operations
- **Socket.io** - WebSocket server for real-time features
- **IMAPflow** - Modern IMAP client for email sync
- **Nodemailer** - Email sending service
- **JWT** - Token-based authentication
- **Bcrypt** - Password hashing
- **Node-cron** - Scheduled tasks
- **Multer** - File upload handling

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v16 or higher recommended)
- **npm** (v8 or higher) or **yarn**
- **PostgreSQL** (v12 or higher)
- **Git** (for version control)

## 📦 Installation

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd conference-crm/crm1
```

### Step 2: Install Dependencies

Install dependencies for root, server, and client:

```bash
npm run install-all
```

Or install them separately:

```bash
# Install root dependencies
npm install

# Install server dependencies
cd server
npm install
cd ..

# Install client dependencies
cd client
npm install
cd ..
```

### Step 3: Database Setup

1. Create a PostgreSQL database:

```sql
CREATE DATABASE conference_crm;
```

2. Update database configuration in `server/config/database.js` or use environment variables.

### Step 4: Environment Configuration

1. Copy the example environment file:

```bash
cp env.example .env
```

2. Update the `.env` file with your configuration:

```env
# Server Configuration
NODE_ENV=development
PORT=3001

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=conference_crm
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# JWT Secret
JWT_SECRET=your_jwt_secret_key_here_change_in_production

# Email Configuration (for SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# IMAP Configuration (for email sync)
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_SECURE=true

# Frontend URL
REACT_APP_API_URL=http://localhost:3001
```

**Important:** For Gmail, you'll need to:
- Enable 2-factor authentication
- Generate an App Password for SMTP/IMAP access
- Use the App Password in your `.env` file

### Step 5: Database Migration

Run database migrations to set up the schema:

```bash
cd server
npx sequelize-cli db:migrate
```

### Step 6: (Optional) Seed Initial Data

If you have seed files, run them:

```bash
npx sequelize-cli db:seed:all
```

## 🚀 Running the Application

### Development Mode

Run both server and client concurrently:

```bash
npm start
```

Or run them separately:

**Terminal 1 - Server:**
```bash
cd server
npm start
```

**Terminal 2 - Client:**
```bash
cd client
npm start
```

The application will be available at:
- **Frontend:** http://localhost:5000
- **Backend API:** http://localhost:3001

### Production Mode

1. Build the client:

```bash
cd client
npm run build
```

2. Start the server (which will serve the built client):

```bash
cd server
npm start
```

## 📁 Project Structure

```
crm1/
├── client/                 # React frontend application
│   ├── public/            # Static files
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── UnifiedEmail.js    # Main email client component
│   │   │   ├── Templates.js      # Email template management
│   │   │   ├── Clients.js        # Client management
│   │   │   ├── ConferenceManagement.js
│   │   │   └── ...              # Other components
│   │   ├── contexts/     # React contexts (AuthContext)
│   │   ├── hooks/        # Custom React hooks
│   │   │   ├── useRealtimeEmail.js
│   │   │   └── useRealtimeSync.js
│   │   └── index.js      # Entry point
│   ├── build/            # Production build output (gitignored)
│   └── package.json
│
├── server/                # Node.js backend application
│   ├── config/           # Configuration files
│   │   ├── database.js
│   │   └── sequelize-cli.js
│   ├── database/         # Database migrations and seeds
│   │   └── migrations/   # Sequelize migrations
│   ├── middleware/      # Express middleware
│   │   └── rbac.js      # Role-based access control
│   ├── models/           # Sequelize models
│   │   ├── User.js
│   │   ├── Client.js
│   │   ├── Email.js
│   │   ├── EmailAccount.js
│   │   └── ...          # Other models
│   ├── routes/           # API routes
│   │   ├── emailRoutes.js
│   │   ├── clientRoutes.js
│   │   └── ...          # Other routes
│   ├── services/         # Business logic services
│   │   ├── EmailService.js
│   │   ├── ImapService.js
│   │   ├── FollowUpService.js
│   │   └── ...          # Other services
│   ├── utils/            # Utility functions
│   └── index.js          # Server entry point
│
├── scripts/              # Deployment and utility scripts
├── .env                  # Environment variables (not in git)
├── env.example           # Example environment file
├── .gitignore            # Git ignore rules
├── package.json          # Root package.json
├── start.sh              # Linux/Mac startup script
├── start-windows.bat      # Windows startup script
├── deploy.sh             # Linux/Mac deployment script
├── deploy-windows.bat     # Windows deployment script
└── README.md             # This file
```

## 🔐 Default Login Credentials

After initial setup, you may need to create a user. If you have seed data, check the seed files for default credentials.

**Note:** Change default passwords immediately in production!

## 📝 API Documentation

API endpoints are documented in:
- `Conference_CRM_API_Collection.postman_collection.json` - Postman collection

### Key API Endpoints

- `POST /api/auth/login` - User authentication
- `GET /api/dashboard` - Dashboard data
- `GET /api/clients` - Get clients
- `POST /api/clients` - Create client
- `GET /api/emails` - Get emails
- `POST /api/emails/send` - Send email
- `GET /api/conferences` - Get conferences
- `POST /api/conferences` - Create conference
- `GET /api/templates` - Get email templates
- `POST /api/templates` - Create email template

## 🔄 Git Workflow & Code Management

### Initial Git Setup

If this is a new repository:

```bash
# Initialize Git repository
git init

# Add remote repository
git remote add origin <your-repository-url>

# Verify remote
git remote -v
```

### Daily Development Workflow

#### 1. Before Starting Work

Always pull the latest changes:

```bash
# Switch to main branch
git checkout main

# Pull latest changes
git pull origin main
```

#### 2. Create a Feature Branch

Never commit directly to `main`. Always create a feature branch:

```bash
# Create and switch to new branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/bug-description
```

**Branch Naming Conventions:**
- `feature/` - New features (e.g., `feature/email-composer-improvements`)
- `fix/` - Bug fixes (e.g., `fix/editor-focus-issue`)
- `refactor/` - Code refactoring (e.g., `refactor/email-service`)
- `docs/` - Documentation updates (e.g., `docs/update-readme`)

#### 3. Make Your Changes

- Write clean, maintainable code
- Follow existing code style
- Add comments for complex logic
- Test your changes locally

#### 4. Stage Your Changes

```bash
# Check what files have changed
git status

# Stage specific files (recommended)
git add path/to/file1.js
git add path/to/file2.js

# Or stage all changes (use carefully)
git add .
```

**Important:** Never commit:
- `.env` files
- `node_modules/` directory
- `build/` or `dist/` directories
- Log files
- Temporary files

#### 5. Commit Your Changes

Write clear, descriptive commit messages:

```bash
# Good commit message format
git commit -m "feat: improve email composer focus handling

- Fixed ReactQuill editor losing focus during typing
- Removed unnecessary memo wrapper causing re-renders
- Simplified onChange handler to match Templates.js pattern
- Added enterprise-level error handling"

# Or shorter format
git commit -m "fix: resolve editor focus loss issue in compose window"
```

**Commit Message Guidelines:**
- Use conventional commit format: `type: description`
- Types: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`
- First line should be concise (50 chars or less)
- Add detailed description if needed (separated by blank line)
- Use imperative mood ("fix" not "fixed" or "fixes")

#### 6. Push to Remote

```bash
# Push your branch to remote
git push origin feature/your-feature-name

# If branch doesn't exist on remote, set upstream
git push -u origin feature/your-feature-name
```

#### 7. Create Pull Request

1. Go to your repository on GitHub/GitLab
2. Click "New Pull Request" or "Create Merge Request"
3. Select your feature branch
4. Add description of changes
5. Request review if needed
6. Wait for approval before merging

### Code Review Checklist

Before submitting a PR, ensure:

- [ ] Code follows existing style and patterns
- [ ] No console.log statements left in code
- [ ] No commented-out code
- [ ] All new features are tested
- [ ] No breaking changes (or documented if necessary)
- [ ] Environment variables are documented in `env.example`
- [ ] README updated if needed
- [ ] No sensitive data in code

### Merging to Main

After PR approval:

```bash
# Switch to main
git checkout main

# Pull latest changes
git pull origin main

# Merge your feature branch
git merge feature/your-feature-name

# Push to remote
git push origin main

# Delete local branch (optional)
git branch -d feature/your-feature-name

# Delete remote branch (optional)
git push origin --delete feature/your-feature-name
```

### Handling Merge Conflicts

If you encounter conflicts:

```bash
# Pull latest changes
git pull origin main

# Resolve conflicts in your editor
# Look for conflict markers: <<<<<<<, =======, >>>>>>>

# After resolving, stage the files
git add conflicted-file.js

# Complete the merge
git commit -m "merge: resolve conflicts with main branch"
```

### Undoing Changes

**Before committing:**
```bash
# Discard changes to a file
git checkout -- path/to/file.js

# Discard all changes
git checkout -- .
```

**After committing (but not pushed):**
```bash
# Undo last commit, keep changes
git reset --soft HEAD~1

# Undo last commit, discard changes
git reset --hard HEAD~1
```

**After pushing:**
```bash
# Create a new commit that reverts changes
git revert <commit-hash>
```

### Best Practices

1. **Commit Often**: Make small, logical commits rather than one large commit
2. **Test Before Committing**: Always test your changes locally
3. **Write Good Messages**: Clear commit messages help team understand changes
4. **Keep Branches Updated**: Regularly merge `main` into your feature branch
5. **Don't Commit Secrets**: Never commit `.env` files or API keys
6. **Review Your Changes**: Use `git diff` before committing
7. **Use .gitignore**: Ensure sensitive files are ignored

### Git Configuration

Set up your Git identity:

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

Enable helpful aliases:

```bash
git config --global alias.st status
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.unstage 'reset HEAD --'
```

## 🚢 Deployment

### Pre-Deployment Checklist

Before deploying to production:

- [ ] All tests pass
- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] Build succeeds without errors
- [ ] No console errors in browser
- [ ] Security review completed
- [ ] Backup current production data

### Deployment Process

#### Option 1: Using Deployment Scripts (Recommended)

**Windows:**
```bash
.\deploy-windows.bat
```

**Linux/Mac:**
```bash
chmod +x deploy.sh
./deploy.sh
```

#### Option 2: Manual Deployment

1. **Pull latest code:**
   ```bash
   git pull origin main
   ```

2. **Install/update dependencies:**
   ```bash
   npm run install-all
   ```

3. **Run database migrations:**
   ```bash
   cd server
   npx sequelize-cli db:migrate
   ```

4. **Build client:**
   ```bash
   cd client
   npm run build
   cd ..
   ```

5. **Restart application:**
   ```bash
   # Stop current processes
   # Then restart using your process manager (PM2, systemd, etc.)
   ```

### Production Deployment with PM2

1. Install PM2 globally:
```bash
npm install -g pm2
```

2. Create `ecosystem.config.js` in root:
```javascript
module.exports = {
  apps: [
    {
      name: 'crm-server',
      script: './server/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/server-error.log',
      out_file: './logs/server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
```

3. Build and start:
```bash
cd client && npm run build && cd ..
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 🔧 Configuration

### Database Configuration

Update `server/config/database.js` or use environment variables:

```javascript
module.exports = {
  development: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres'
  }
};
```

### Email Account Setup

1. Go to Settings > Email Accounts in the UI
2. Add your SMTP account
3. Configure IMAP settings for email sync
4. Test the connection

### Security Considerations

- Change default JWT secret in production
- Use strong database passwords
- Enable HTTPS in production
- Set up CORS properly
- Use environment variables for all secrets
- Regularly update dependencies
- Review and update `.gitignore` regularly
- Never commit sensitive data

## 🧪 Testing

Run tests (if available):

```bash
# Server tests
cd server
npm test

# Client tests
cd client
npm test
```

## 📚 Additional Documentation

- `DEPLOYMENT.md` - Detailed deployment guide
- `QUICK_DEPLOY.md` - Quick deployment instructions
- `ENTERPRISE_ARCHITECTURE.md` - Architecture documentation
- `CHANGELOG.md` - Version history and changes

## 🤝 Contributing

### Development Workflow

1. Fork the repository (if external contributor)
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly
5. Commit your changes (`git commit -m 'feat: Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Code Style Guidelines

- Follow existing code style and patterns
- Use meaningful variable and function names
- Add comments for complex logic
- Write descriptive commit messages
- Keep functions small and focused
- Use ES6+ features where appropriate
- Follow React best practices
- Use async/await for asynchronous code

### Pull Request Guidelines

- Provide clear description of changes
- Reference related issues
- Include screenshots for UI changes
- Ensure all tests pass
- Update documentation if needed
- Get at least one code review approval

## 🐛 Troubleshooting

### Common Issues

**Database Connection Error:**
- Check PostgreSQL is running
- Verify database credentials in `.env`
- Ensure database exists
- Check network connectivity

**Email Sync Not Working:**
- Verify IMAP credentials
- Check firewall settings
- Ensure App Password is used for Gmail
- Check IMAP service is enabled

**Port Already in Use:**
- Change PORT in `.env`
- Kill process using the port:
  ```bash
  # Windows
  netstat -ano | findstr :3001
  taskkill /PID <PID> /F
  
  # Linux/Mac
  lsof -ti:3001 | xargs kill
  ```

**Build Errors:**
- Clear node_modules and reinstall
- Check Node.js version compatibility
- Verify all dependencies are installed
- Clear build cache: `rm -rf client/build`

**Editor Focus Issues:**
- Clear browser cache
- Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
- Check browser console for errors
- Verify ReactQuill is properly initialized

**Git Issues:**
- Check `.gitignore` is properly configured
- Verify you're on the correct branch
- Ensure remote is set correctly
- Check for merge conflicts

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👥 Authors

- Development Team

## 🙏 Acknowledgments

- React team for the amazing framework
- Express.js for the robust backend framework
- All open-source contributors
- Quill.js for the rich text editor

## 📞 Support

For support, create an issue in the GitHub repository or contact the development team.

## 🔄 Changelog

See `CHANGELOG.md` for detailed changelog and version history.

---

**Made with ❤️ for enterprise conference management**

**Last Updated:** December 2025
