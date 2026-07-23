const { query } = require('../database');

class Doctor {
    constructor(data = {}) {
        this.id = data.id || null;
        this.email = data.email || '';
        this.password = data.password || '';
        this.name = data.name || '';
        this.resetPasswordToken = data.resetPasswordToken || null;
        this.resetPasswordExpires = data.resetPasswordExpires || null;
        this.otp = data.otp || null;
        this.otpExpiry = data.otpExpiry || null;
        this.createdAt = data.createdAt || null;
    }

    static async findOne(criteria) {
        let sql = 'SELECT * FROM doctors WHERE 1=1';
        const params = [];

        if (criteria.email) {
            sql += ' AND email = ?';
            params.push(criteria.email.toLowerCase());
        }
        if (criteria.otp) {
            sql += ' AND otp = ?';
            params.push(criteria.otp);
        }
        if (criteria.otpExpiry && criteria.otpExpiry.$gt) {
            sql += ' AND CAST(otpExpiry AS INTEGER) > ?';
            params.push(Number(criteria.otpExpiry.$gt));
        }

        try {
            const row = await query.get(sql, params);
            if (!row) return null;
            return new Doctor(row);
        } catch (err) {
            console.error('Error in Doctor.findOne:', err.message);
            throw err;
        }
    }

    async save() {
        if (this.id) {
            // Update
            const sql = `
                UPDATE doctors 
                SET email = ?, password = ?, name = ?, resetPasswordToken = ?, resetPasswordExpires = ?, otp = ?, otpExpiry = ?
                WHERE id = ?
            `;
            const params = [
                this.email.toLowerCase(),
                this.password,
                this.name,
                this.resetPasswordToken,
                this.resetPasswordExpires,
                this.otp,
                this.otpExpiry,
                this.id
            ];
            await query.run(sql, params);
            return this;
        } else {
            // Insert
            const sql = `
                INSERT INTO doctors (email, password, name, resetPasswordToken, resetPasswordExpires, otp, otpExpiry)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            const params = [
                this.email.toLowerCase(),
                this.password,
                this.name,
                this.resetPasswordToken,
                this.resetPasswordExpires,
                this.otp,
                this.otpExpiry
            ];
            const result = await query.run(sql, params);
            this.id = result.lastID;
            return this;
        }
    }
}

module.exports = Doctor;
