import { describe, expect, it } from "vitest";
import { DOWNLOADS, buildManifest, signedVersion } from "./make-update-manifest.mjs";

/** A signature file the way the build writes it: the signature text, base64 encoded. */
function sig(file, version = "0.2.0") {
  const comment = version === null ? `timestamp:1\tfile:${file}` : `timestamp:1\tfile:${file}\tversion:${version}`;
  return Buffer.from(
    `untrusted comment: signature from tauri secret key\nRUabc=\ntrusted comment: ${comment}\nxyz==`,
  ).toString("base64");
}

/** The signatures of one complete release. */
function release(version = "0.2.0") {
  return [
    `kinlo_${version}_x64-setup.exe`,
    `kinlo_${version}_x64_en-US.msi`,
    `kinlo_${version}_aarch64.app.tar.gz`,
    `kinlo_${version}_x64.app.tar.gz`,
    `kinlo_${version}_amd64.AppImage`,
    `kinlo_${version}_amd64.deb`,
    `kinlo-${version}-1.x86_64.rpm`,
  ].map((file) => ({ name: `${file}.sig`, contents: `${sig(file, version)}\n` }));
}

const build = (signatures, tag = "v0.2.0") =>
  buildManifest({ tag, repository: "mkhanani/kinlo", signatures, now: new Date("2026-11-21T12:00:00Z") });

describe("the update file", () => {
  it("lists every system, each under its own kind and a default", () => {
    const manifest = build(release());
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.pub_date).toBe("2026-11-21T12:00:00.000Z");
    expect(Object.keys(manifest.platforms).sort()).toEqual(
      [
        "darwin-aarch64",
        "darwin-aarch64-app",
        "darwin-x86_64",
        "darwin-x86_64-app",
        "linux-x86_64",
        "linux-x86_64-appimage",
        "linux-x86_64-deb",
        "linux-x86_64-rpm",
        "windows-x86_64",
        "windows-x86_64-msi",
        "windows-x86_64-nsis",
      ].sort(),
    );
    // Someone who installed with the .exe gets the .exe, not the .msi.
    expect(manifest.platforms["windows-x86_64"].url).toBe(
      "https://github.com/mkhanani/kinlo/releases/download/v0.2.0/kinlo_0.2.0_x64-setup.exe",
    );
    expect(manifest.platforms["windows-x86_64-nsis"]).toEqual(manifest.platforms["windows-x86_64"]);
    expect(manifest.platforms["linux-x86_64"].url).toMatch(/kinlo_0\.2\.0_amd64\.AppImage$/);
    expect(manifest.platforms["linux-x86_64-rpm"].url).toMatch(/kinlo-0\.2\.0-1\.x86_64\.rpm$/);
    expect(manifest.platforms["darwin-aarch64"].url).toMatch(/kinlo_0\.2\.0_aarch64\.app\.tar\.gz$/);
    // The signature is passed on exactly, without the line break at the end of the file.
    expect(manifest.platforms["linux-x86_64-deb"].signature).toBe(sig("kinlo_0.2.0_amd64.deb"));
  });

  it("is not written when a system is missing", () => {
    const withoutMac = release().filter(({ name }) => !name.includes("aarch64"));
    expect(() => build(withoutMac)).toThrow(/macOS Apple Silicon app: expected one signature, found 0/);
  });

  it("is not written when two files claim the same system", () => {
    const twice = [...release(), { name: "kinlo_0.1.9_amd64.deb.sig", contents: sig("kinlo_0.1.9_amd64.deb", "0.1.9") }];
    expect(() => build(twice)).toThrow(/Linux \.deb: expected one signature, found 2/);
  });

  it("is not written when a download was signed for another version, or for none", () => {
    const stale = release().map((entry) =>
      entry.name.endsWith(".deb.sig") ? { ...entry, contents: sig("kinlo_0.2.0_amd64.deb", "0.1.1") } : entry,
    );
    expect(() => build(stale)).toThrow(/Linux \.deb: .* was signed for version 0\.1\.1, not 0\.2\.0/);

    const unversioned = release().map((entry) =>
      entry.name.endsWith(".rpm.sig") ? { ...entry, contents: sig("kinlo-0.2.0-1.x86_64.rpm", null) } : entry,
    );
    expect(() => build(unversioned)).toThrow(/Linux \.rpm: .* was signed for version nothing/);
  });

  it("refuses a tag that is not a version", () => {
    expect(() => build(release(), "latest")).toThrow(/not a version like/);
  });

  it("covers each kind of download once", () => {
    const keys = DOWNLOADS.flatMap((download) => download.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("reading a signature", () => {
  it("finds the version it was made for", () => {
    expect(signedVersion(sig("a.deb", "1.2.3"))).toBe("1.2.3");
    expect(signedVersion(sig("a.deb", null))).toBeNull();
    expect(signedVersion("not a signature")).toBeNull();
  });
});
