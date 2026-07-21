CREATE TYPE "public"."source" AS ENUM('manual', 'import');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."scaleType" AS ENUM('higher_better_120', 'higher_better_100', 'lower_better_100', 'lower_better_120', 'target_range');--> statement-breakpoint
CREATE TABLE "area_perspective_weights" (
	"id" serial PRIMARY KEY NOT NULL,
	"areaId" integer NOT NULL,
	"perspectiveId" integer NOT NULL,
	"weight" double precision DEFAULT 0 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "areas" (
	"id" serial PRIMARY KEY NOT NULL,
	"companyId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"parentAreaId" integer,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calibration_rule_ranges" (
	"id" serial PRIMARY KEY NOT NULL,
	"ruleId" integer NOT NULL,
	"minAttainment" double precision,
	"minInclusive" boolean DEFAULT true NOT NULL,
	"maxAttainment" double precision,
	"maxInclusive" boolean DEFAULT false NOT NULL,
	"score" double precision DEFAULT 0 NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calibration_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"companyId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"directConversion" boolean DEFAULT false NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"cnpj" varchar(32),
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"companyId" integer NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"fileName" varchar(512),
	"totalRows" integer DEFAULT 0 NOT NULL,
	"matchedRows" integer DEFAULT 0 NOT NULL,
	"unmatchedRows" text,
	"importedBy" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indicator_area_applicability" (
	"id" serial PRIMARY KEY NOT NULL,
	"indicatorId" integer NOT NULL,
	"areaId" integer NOT NULL,
	"applicable" boolean DEFAULT true NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indicator_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"indicatorId" integer NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"goal" double precision,
	"result" double precision,
	"source" "source" DEFAULT 'manual' NOT NULL,
	"updatedBy" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indicators" (
	"id" serial PRIMARY KEY NOT NULL,
	"companyId" integer NOT NULL,
	"perspectiveId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"unit" varchar(32) DEFAULT 'number',
	"scaleType" "scaleType" DEFAULT 'higher_better_100' NOT NULL,
	"objectiveId" integer,
	"calibrationRuleId" integer,
	"defaultGoal" double precision,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objectives" (
	"id" serial PRIMARY KEY NOT NULL,
	"companyId" integer NOT NULL,
	"perspectiveId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "perspectives" (
	"id" serial PRIMARY KEY NOT NULL,
	"companyId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"color" varchar(16) DEFAULT '#1e3a5f',
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_area_persp" ON "area_perspective_weights" USING btree ("areaId","perspectiveId");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ind_area" ON "indicator_area_applicability" USING btree ("indicatorId","areaId");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ind_period" ON "indicator_entries" USING btree ("indicatorId","year","month");