# License Manager Pro

**License Manager Pro** is a comprehensive system for managing API keys, licenses, and system settings. Specifically designed for teams and organizations, this tool provides precise and secure management of software access and user permissions. Built with **React.js** on the frontend and **FastAPI** on the backend, it offers high performance and flexibility.

---

## Key Features:
- **API Key Management:** View, delete, and manage access rights for API keys.
- **License Management:** Analyze and filter licenses with the ability to view details based on status and time intervals.
- **System Settings:** Dynamically update system configurations and automatically check for new versions.
- **Automatic Updates:** Notify and enable admins to update the system to the latest version seamlessly.
- **High Security:** Utilize JWT for authentication and access control.
- **Modern UI:** Responsive and user-friendly interface with a graphical dashboard for easy management.

---

## نصب و راه‌اندازی

### مرحله 1: کلون کردن مخزن
ریپازیتوری اصلی پروژه را کلون کنید و وارد پوشه پروژه شوید:

```bash
git clone https://github.com/rzatkv/LicenseManagerPro.git
cd LicenseManagerPro
```

---

### مرحله 2: نصب پیش‌نیازها

#### نصب پیش‌نیازهای بک‌اند
وارد پوشه بک‌اند شوید و پیش‌نیازهای مربوطه را نصب کنید:

```bash
cd backend
pip install -r requirements.txt
```

این دستور تمامی وابستگی‌های مورد نیاز برای اجرای بک‌اند (مانند FastAPI، SQLAlchemy، PyMySQL و ...) را نصب می‌کند.

#### نصب پیش‌نیازهای فرانت‌اند
وارد پوشه فرانت‌اند شوید و پیش‌نیازهای مربوط به فرانت‌اند را نصب کنید:

```bash
cd ../frontend
npm install
```

این دستور تمامی پکیج‌های مورد نیاز برای اجرای فرانت‌اند (مانند React، React Router، و ...) را دانلود و نصب می‌کند.

---

### مرحله 3: تنظیمات پروژه

#### تنظیمات بک‌اند
1. وارد پوشه `backend` شوید:
   ```bash
   cd backend
   ```
2. فایل `database.py` را باز کنید.
3. مقدار `DATABASE_URL` را با اطلاعات پایگاه داده MySQL خود تنظیم کنید:
   ```python
   DATABASE_URL = "mysql+pymysql://username:password@localhost/dbname"
   ```
   - `username`: نام کاربری پایگاه داده.
   - `password`: رمز عبور پایگاه داده.
   - `localhost`: آدرس سرور پایگاه داده (یا IP).
   - `dbname`: نام پایگاه داده‌ای که ایجاد کرده‌اید.

4. اطمینان حاصل کنید که پایگاه داده (`dbname`) از قبل ایجاد شده باشد.

#### تنظیمات فرانت‌اند
1. وارد پوشه `frontend` شوید:
   ```bash
   cd ../frontend
   ```
2. فایل `src/config.js` را باز کنید.
3. آدرس API بک‌اند را تنظیم کنید:
   ```javascript
   export const API_BASE_URL = "http://127.0.0.1:8000/api";
   ```
   - اگر از دامنه یا آدرس سرور دیگری استفاده می‌کنید، مقدار `API_BASE_URL` را مطابق آن تنظیم کنید.

---

### مرحله 4: اجرای پروژه

#### اجرای بک‌اند
وارد پوشه `backend` شوید و سرور را اجرا کنید:

```bash
cd backend
uvicorn main:app --reload
```

سرور شما در آدرس زیر اجرا خواهد شد:
- **http://127.0.0.1:8000**

برای مشاهده مستندات API:
- Swagger UI: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- OpenAPI JSON: [http://127.0.0.1:8000/openapi.json](http://127.0.0.1:8000/openapi.json)

#### اجرای فرانت‌اند
وارد پوشه `frontend` شوید و برنامه را اجرا کنید:

```bash
cd ../frontend
npm start
```

برنامه شما در مرورگر در آدرس زیر اجرا خواهد شد:
- **http://localhost:3000**

---

## API Endpoints

### Authentication
- **POST** `/api/auth/login`: Authenticate users and return a JWT token.

### API Key Management
- **GET** `/api/api-keys`: Retrieve all API keys.
- **DELETE** `/api/api-keys/{id}`: Delete an API key by ID.

### License Management
- **GET** `/api/licenses`: Retrieve licenses with optional filters.
- **POST** `/api/licenses`: Add a new license.
- **DELETE** `/api/licenses/{id}`: Delete a license by ID.

### System Settings
- **GET** `/api/settings`: Retrieve system settings.
- **PUT** `/api/settings/{key}`: Update a specific setting.

### System Updates
- **GET** `/api/system/check-updates`: Check if a new system update is available.
- **POST** `/api/system/update`: Apply the latest system update.

---

## Contributors
- **Reza Karimi** - [rzatkv](https://github.com/rzatkv)

---

## License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).
