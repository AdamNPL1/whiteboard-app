export const PASSWORD_MIN_LENGTH = 12;

export const getPasswordPolicyError = (password: string) => {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > 128) {
    return `Password must be between ${PASSWORD_MIN_LENGTH} and 128 characters.`;
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    return "Password must contain an uppercase and a lowercase letter.";
  }
  if (!/\d/.test(password)) {
    return "Password must contain a number.";
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password must contain a symbol.";
  }
  return null;
};
