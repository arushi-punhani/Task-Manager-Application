async function sendVerificationEmail({ to, verificationUrl }) {
  console.info(`[mock email] To: ${to}\nVerify your account: ${verificationUrl}`);
}

async function sendTaskAssignmentEmail({ to, taskTitle }) {
  console.info(
    `[mock email] To: ${to}\nYou have been assigned a task: ${taskTitle}`
  );
}

module.exports = {
  sendVerificationEmail,
  sendTaskAssignmentEmail
};