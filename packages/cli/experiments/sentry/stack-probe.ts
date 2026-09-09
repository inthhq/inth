const fail = (): void => {
  throw new Error("Sentry compatibility probe");
};
try {
  fail();
} catch (error) {
  if (error instanceof Error) {
    console.log(error.stack || "No stack available");
  }
}
