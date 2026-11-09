import { describe, expect, it } from "vitest";
import { BACKUP_EXCLUDED_TABLE_DATA, pgDumpArgs, pgEnvFromUrl } from "./backup";

describe("pgEnvFromUrl", () => {
  it("splits a URL into PG* variables, decoding escapes", () => {
    expect(pgEnvFromUrl("postgres://my_recipes:p%40ss%2Fw@localinfra-postgres:5432/my_recipes?sslmode=require")).toEqual({
      PGHOST: "localinfra-postgres",
      PGPORT: "5432",
      PGUSER: "my_recipes",
      PGPASSWORD: "p@ss/w",
      PGDATABASE: "my_recipes",
      PGSSLMODE: "require",
    });
  });
  it("omits what is absent", () => {
    expect(pgEnvFromUrl("postgresql://localhost/db")).toEqual({ PGHOST: "localhost", PGDATABASE: "db" });
  });
  it("throws on garbage", () => {
    expect(() => pgEnvFromUrl("nope")).toThrow();
  });
});

describe("pgDumpArgs", () => {
  it("excludes the data of every secret-bearing auth table and never carries the URL", () => {
    const args = pgDumpArgs();
    expect(args[0]).toBe("-Fc");
    for (const t of ["session", "account", "verification"]) expect(args).toContain(`--exclude-table-data=public.${t}`);
    expect(BACKUP_EXCLUDED_TABLE_DATA).toHaveLength(3);
    expect(args.join(" ")).not.toContain("postgres");
  });
});
