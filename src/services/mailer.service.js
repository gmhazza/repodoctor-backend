import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendMail = async (to, subject, body) => {
  return transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject,
    html: body,
  });
};