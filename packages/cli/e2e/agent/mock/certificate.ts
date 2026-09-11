import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface TestCertificate {
  // PEM path for NODE_EXTRA_CA_CERTS in the spawned CLI.
  caPath: string;
  cert: string;
  key: string;
  remove: () => Promise<void>;
}

// A fresh CA and leaf per run, generated with the openssl binary. Node cannot
// mint X.509 certificates itself and a committed key would be a long-lived
// secret in the repository. macOS and the Ubuntu runners ship openssl; the
// extensions live in config files so LibreSSL builds without -addext also work.
const caConfig = `[req]
distinguished_name = dn
x509_extensions = ca
prompt = no
[dn]
CN = Inth CLI e2e CA
[ca]
basicConstraints = critical, CA:TRUE
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
`;
const serverConfig = `[req]
distinguished_name = dn
prompt = no
[dn]
CN = localhost
[server]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:localhost, IP:127.0.0.1, IP:::1
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid
`;

export const generateCertificate = async (): Promise<TestCertificate> => {
  const directory = await mkdtemp(path.join(tmpdir(), "inth-agent-e2e-ca-"));
  const openssl = (args: string[]) =>
    run("openssl", args, { cwd: directory, timeout: 60_000 });
  await writeFile(path.join(directory, "ca.cnf"), caConfig);
  await writeFile(path.join(directory, "server.cnf"), serverConfig);
  await openssl([
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-sha256",
    "-days",
    "2",
    "-config",
    "ca.cnf",
    "-keyout",
    "ca.key",
    "-out",
    "ca.pem",
  ]);
  await openssl([
    "req",
    "-new",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-sha256",
    "-config",
    "server.cnf",
    "-keyout",
    "server.key",
    "-out",
    "server.csr",
  ]);
  await openssl([
    "x509",
    "-req",
    "-sha256",
    "-days",
    "2",
    "-in",
    "server.csr",
    "-CA",
    "ca.pem",
    "-CAkey",
    "ca.key",
    "-CAcreateserial",
    "-extfile",
    "server.cnf",
    "-extensions",
    "server",
    "-out",
    "server.pem",
  ]);
  const [cert, key] = await Promise.all([
    readFile(path.join(directory, "server.pem"), "utf-8"),
    readFile(path.join(directory, "server.key"), "utf-8"),
  ]);
  return {
    caPath: path.join(directory, "ca.pem"),
    cert,
    key,
    remove: () => rm(directory, { force: true, recursive: true }),
  };
};
