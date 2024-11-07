import emailjs from '@emailjs/browser';

// Initialize EmailJS with your user ID
emailjs.init("api_key_here");

export const sendEmail = (message: string) => {
  return emailjs.send(
    "service_x0qqh0z",
    "template_tr6u4qr",
    {
      to_email: "your_email",
      message: message,
    }
  );
};