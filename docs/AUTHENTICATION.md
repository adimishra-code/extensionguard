# Authentication System

Extension Guard v2.0 authentication system with JWT and API key support.

## Features

- User registration with email/password
- Login with JWT token generation
- API key authentication for extensions
- Password hashing with bcrypt
- Secure token verification
- Profile management
- Password change
- API key regeneration

---

## API Endpoints

### Register User

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "clx...",
    "email": "user@example.com",
    "api_key": "eg_abc123...",
    "created_at": "2024-08-19T..."
  },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "user": {
    "id": "clx...",
    "email": "user@example.com",
    "api_key": "eg_abc123..."
  },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Get Profile

```http
GET /api/auth/profile
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "user": {
    "id": "clx...",
    "email": "user@example.com",
    "api_key": "eg_abc123...",
    "created_at": "2024-08-19T...",
    "updated_at": "2024-08-19T...",
    "last_login_at": "2024-08-19T..."
  }
}
```

### Regenerate API Key

```http
POST /api/auth/regenerate-api-key
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "message": "API key regenerated successfully",
  "user": {
    "id": "clx...",
    "email": "user@example.com",
    "api_key": "eg_xyz789..."
  }
}
```

### Change Password

```http
POST /api/auth/change-password
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "current_password": "oldPassword123",
  "new_password": "newPassword456"
}
```

**Response:**
```json
{
  "message": "Password changed successfully"
}
```

---

## Authentication Methods

### 1. JWT Token (Web Dashboard)

Use for web application requests:

```javascript
fetch('http://localhost:3001/api/auth/profile', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### 2. API Key (Chrome Extension)

Use for extension requests:

```javascript
fetch('http://localhost:3001/api/monitor/...', {
  headers: {
    'X-API-Key': 'eg_abc123...'
  }
});
```

---

## Security Considerations

1. **Password Requirements:**
   - Minimum 8 characters
   - Maximum 100 characters
   - Hashed with bcrypt (10 salt rounds)

2. **JWT Tokens:**
   - Expire after 7 days
   - Signed with secret from environment variable
   - Include userId and email in payload

3. **API Keys:**
   - Generated with cryptographically secure random values
   - Prefixed with `eg_` for identification
   - Can be regenerated at any time

4. **Best Practices:**
   - Never expose JWT_SECRET
   - Use HTTPS in production
   - Store tokens securely (not in localStorage)
   - Rotate API keys periodically

---

## Environment Variables

Add to `.env`:

```env
JWT_SECRET="your-secure-random-string-here"
```

Generate a secure secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Usage Examples

### Web Dashboard Login

```typescript
async function login(email: string, password: string) {
  const response = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();
  
  // Store token
  localStorage.setItem('token', data.token);
  
  return data.user;
}
```

### Chrome Extension Setup

```typescript
// Get API key from user settings
const apiKey = await chrome.storage.local.get('apiKey');

// Use in requests
const response = await fetch('http://localhost:3001/api/monitor/scan', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
  },
  body: JSON.stringify({ extensionId: 'abc123' }),
});
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Validation failed",
  "details": [...]
}
```

### 401 Unauthorized
```json
{
  "error": "Invalid credentials"
}
```

### 404 Not Found
```json
{
  "error": "User not found"
}
```

---

## Testing

### Register a Test User

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Get Profile (with token)

```bash
curl http://localhost:3001/api/auth/profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## Next Steps

After implementing authentication:

1. ✅ Protect scan endpoints with authentication
2. ✅ Add authentication to WebSocket connections
3. ✅ Implement user-specific monitoring
4. ✅ Add rate limiting per user
5. ✅ Build login UI in frontend
