import nodemailer from "nodemailer";
import ejs from "ejs";
import path from "path";
import { fileURLToPath } from "url";

// Define __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sendMail = async (options) => {
    // Create a transporter
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        service: process.env.SMTP_SERVICE,
        auth: {
            user: process.env.SMTP_MAIL,
            pass: process.env.SMTP_PASSWORD,
        },
    });

    // Destructure options
    const { email, subject, template, data } = options;

    // Get the path of the email template file
    // Note: Adjust the "../mails" path if your folder structure is different
    const templatePath = path.join(__dirname, "../mails", template);

    // Render the email template with EJS
    const html = await ejs.renderFile(templatePath, data);

    // Mail options
    const mailOptions = {
        from: process.env.SMTP_MAIL,
        to: email,
        subject,
        html,
    };

    await transporter.sendMail(mailOptions);
};

export default sendMail;