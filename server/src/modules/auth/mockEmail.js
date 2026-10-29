async function sendVerificationEmail({ to, verificationUrl }) {
  console.info(`[mock email] To: ${to}\nVerify your account: ${verificationUrl}`);
}

module.exports = { sendVerificationEmail };