async function sendVerificationEmail({ to, verificationUrl }) {
  console.info(`[mock email] To: ${to}\nVerify your account: ${verificationUrl}`);
}

async function sendPasswordResetEmail({ to, resetUrl }) {
  console.info(`[mock email] To: ${to}\nReset your password: ${resetUrl}`);
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
