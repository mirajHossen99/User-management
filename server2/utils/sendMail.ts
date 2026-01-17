import nodemailer, { Transporter } from "nodemailer";
import ejs from "ejs";
import path from "path";


interface IEmailOptions {
    email: string;
    subject: string;
    template: string;
    data: {[key: string]: any}

}

const sendMail = async (options: IEmailOptions): Promise<void> => {
    // Create a transporter
    const transporter: Transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        service: process.env.SMTP_SERVICE,
        auth: {
            user: process.env.SMTP_MAIL,
            pass: process.env.SMTP_PASSWORD,
        }
    });

    // Destructure options
    const { email, subject, template, data } = options;

    // get the path of email template file
    const templatePath: string = path.join(__dirname, "../mails", template);

    // Render the email template with EJS
    const html: string = await ejs.renderFile(templatePath, data);

    // Mail options
    const mailOptions = {
        from: process.env.SMTP_MAIL,
        to: email,
        subject,
        html
    };

    await transporter.sendMail(mailOptions);
};

export default sendMail;