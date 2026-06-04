import { describe, it, expect } from "vitest";
import { parseDocumentText } from "./ocrParse";

// Each fixture below mirrors what tesseract.js produces when scanning a real
// document of that type. They're intentionally a little noisy: stripped
// diacritics ("ESPANA"/"ESPANOLA"), occasional misordered fields, and
// realistic ICAO 9303 MRZ formatting (TD3 = 2x44 for passports, TD1 = 3x30
// for ID cards).

// ─── 1. US passport (TD3) ────────────────────────────────────────────────
const US_PASSPORT = `
UNITED STATES OF AMERICA
PASSPORT / PASSEPORT / PASAPORTE

Type/Type/Tipo   Code/Code/Codigo   Passport No./No. du Passeport
P                USA                 568294713
Surname/Nom/Apellidos
HOLLOWAY
Given Names/Prenoms/Nombres
MARGARET ELAINE
Nationality / Nationalite
UNITED STATES OF AMERICA
Date of birth / Date de naissance
14 Jul 1988
Place of birth / Lieu de naissance
TEXAS, U.S.A.
Sex/Sexe   Date of issue / Date de delivrance
F          22 Mar 2022
Authority / Autorite             Date of expiration / Date d'expiration
United States Department of State  21 Mar 2032

P<USAHOLLOWAY<<MARGARET<ELAINE<<<<<<<<<<<<<<
5682947130USA8807144F3203218<<<<<<<<<<<<<<06
`;

describe("parseDocumentText — US passport (TD3 MRZ)", () => {
  const r = parseDocumentText(US_PASSPORT);
  it("uses the TD3 path", () => expect(r.source).toBe("mrz-td3"));
  it("first name", () => expect(r.firstName).toBe("Margaret"));
  it("last name", () => expect(r.lastName).toBe("Holloway"));
  it("doc number", () => expect(r.docNumber).toBe("568294713"));
  it("expiry", () => expect(r.expiryISO).toBe("2032-03-21"));
  it("country", () => expect(r.country).toBe("United States"));
});

// ─── 2. US driver's license (California) ────────────────────────────────
const US_DRIVERS_LICENSE = `
CALIFORNIA
USA  DRIVER LICENSE
                                       fed limits apply
DL  D1428376
EXP 09/12/2029
LN  RAMIREZ-CHEN
FN  ANTHONY J
1842 NORTHGATE BLVD APT 7B
SAN JOSE, CA 95110
DOB 09/12/1991
RSTR  NONE
CLASS C       END NONE
SEX M  HGT 5-10  WGT 175
EYES BRN  HAIR BLK
ISS 09/12/2024
DD 14/A/27/93/A1B/2401
`;

describe("parseDocumentText — US driver's license", () => {
  const r = parseDocumentText(US_DRIVERS_LICENSE);
  it("license path", () => expect(r.source).toBe("license"));
  it("first/last from FN/LN labels", () => {
    expect(r.firstName).toBe("Anthony");
    expect(r.lastName).toBe("Ramirez-Chen");
  });
  it("DL number from DL label", () => expect(r.docNumber).toBe("D1428376"));
  it("EXP wins over DOB and ISS (both also dates)", () =>
    expect(r.expiryISO).toBe("2029-09-12"));
  it("country from USA", () => expect(r.country).toBe("United States"));
});

// ─── 3. Canadian passport (TD3, bilingual) ──────────────────────────────
const CA_PASSPORT = `
PASSPORT
PASSEPORT
CANADA

Type / Type   Issuing Country / Pays emetteur   Passport No. / No de passeport
P             CAN                               AB492718
Surname / Nom
TREMBLAY
Given names / Prenoms
JEAN-PHILIPPE MARC
Nationality / Nationalite
CANADIAN / CANADIENNE
Date of birth / Date de naissance
03 FEB / FEV 85
Sex / Sexe    Place of birth / Lieu de naissance
M             MONTREAL QC, CAN
Date of issue / Date de delivrance
17 NOV / NOV 23
Date of expiry / Date d'expiration
17 NOV / NOV 33
Authority / Autorite
Passport Canada / Passeport Canada

P<CANTREMBLAY<<JEAN<PHILIPPE<MARC<<<<<<<<<<<
AB492718<0CAN8502035M3311172<<<<<<<<<<<<<<04
`;

describe("parseDocumentText — Canadian passport (TD3 MRZ)", () => {
  const r = parseDocumentText(CA_PASSPORT);
  it("TD3 path", () => expect(r.source).toBe("mrz-td3"));
  it("first name (first token only — MRZ can't tell hyphen from space)", () =>
    expect(r.firstName).toBe("Jean"));
  it("last name", () => expect(r.lastName).toBe("Tremblay"));
  it("doc number", () => expect(r.docNumber).toBe("AB492718"));
  it("expiry", () => expect(r.expiryISO).toBe("2033-11-17"));
  it("country from CAN", () => expect(r.country).toBe("Canada"));
});

// ─── 4. Canadian driver's licence (Ontario) ─────────────────────────────
const CA_DRIVERS_LICENCE = `
ONTARIO  CANADA
DRIVER'S LICENCE / PERMIS DE CONDUIRE

LN  OKAFOR
FN  CHIDINMA AKUA
418 SPADINA AVE
TORONTO ON M5T 2G7

DD  T2841-50294-91207
DOB 1992/07/21
SEX F   HT 168 cm
ISS 2025/04/03
EXP 2030/07/21
CLASS  G
COND   None / Aucune
`;

describe("parseDocumentText — Canadian driver's licence", () => {
  const r = parseDocumentText(CA_DRIVERS_LICENCE);
  it("license path", () => expect(r.source).toBe("license"));
  it("first/last names", () => {
    expect(r.firstName).toBe("Chidinma");
    expect(r.lastName).toBe("Okafor");
  });
  it("expiry from EXP label (YYYY/MM/DD)", () =>
    expect(r.expiryISO).toBe("2030-07-21"));
  it("country from CANADA", () => expect(r.country).toBe("Canada"));
});

// ─── 5. German Reisepass (TD3) ──────────────────────────────────────────
const DE_PASSPORT = `
BUNDESREPUBLIK DEUTSCHLAND
REISEPASS / PASSPORT / PASSEPORT

Typ / Type    Code des ausstellenden Staates    Reisepass-Nr. / Passport No.
P             D                                  C7K2N4Q9P
Name / Surname / Nom
Familienname / Surname
SCHWARZBACH
Vornamen / Given names
LUKAS MATHIAS
Staatsangehoerigkeit / Nationality
DEUTSCH
Geburtsdatum / Date of birth
12.05.1990
Geburtsort / Place of birth
HEIDELBERG
Geschlecht / Sex   Ausstellungsdatum / Date of issue
M                  03.09.2024
Ausstellende Behoerde / Authority
Stadt Heidelberg
Gueltig bis / Date of expiry
02.09.2034

P<D<<SCHWARZBACH<<LUKAS<MATHIAS<<<<<<<<<<<<<
C7K2N4Q9P4DEU9005128M3409029<<<<<<<<<<<<<<00
`;

describe("parseDocumentText — German Reisepass (TD3 MRZ)", () => {
  const r = parseDocumentText(DE_PASSPORT);
  it("TD3 path", () => expect(r.source).toBe("mrz-td3"));
  it("first name", () => expect(r.firstName).toBe("Lukas"));
  it("last name", () => expect(r.lastName).toBe("Schwarzbach"));
  it("doc number", () => expect(r.docNumber).toBe("C7K2N4Q9P"));
  it("expiry", () => expect(r.expiryISO).toBe("2034-09-02"));
  it("country (D<< prefix)", () => expect(r.country).toBe("Germany"));
});

// ─── 6. German Personalausweis (TD1) ────────────────────────────────────
const DE_PERSONALAUSWEIS = `
BUNDESREPUBLIK DEUTSCHLAND
PERSONALAUSWEIS / IDENTITY CARD / CARTE D'IDENTITE

Familienname / Surname
WEIGAND
Geburtsname / Birth name
HOFFMANN
Vornamen / Given names
ANNIKA SOPHIE
Staatsangehoerigkeit / Nationality   DEUTSCH
Geburtsdatum / Date of birth         07.11.1995
Geburtsort / Place of birth          NUERNBERG
Gueltig bis / Date of expiry         15.01.2034
Dokumentennummer / Document No.      LF8R29WQ4

IDD<<LF8R29WQ40<<<<<<<<<<<<<<6
9511073<3401158D<<<<<<<<<<<<<2
WEIGAND<<ANNIKA<SOPHIE<<<<<<<<
`;

describe("parseDocumentText — German Personalausweis (TD1 MRZ)", () => {
  const r = parseDocumentText(DE_PERSONALAUSWEIS);
  it("TD1 path", () => expect(r.source).toBe("mrz-td1"));
  it("first name", () => expect(r.firstName).toBe("Annika"));
  it("last name", () => expect(r.lastName).toBe("Weigand"));
  it("doc number from line 1", () => expect(r.docNumber).toBe("LF8R29WQ4"));
  it("expiry", () => expect(r.expiryISO).toBe("2034-01-15"));
  it("country (D in TD1)", () => expect(r.country).toBe("Germany"));
});

// ─── 7. Spanish passport (TD3) ──────────────────────────────────────────
const ES_PASSPORT = `
REINO DE ESPANA
PASAPORTE / PASSPORT / PASSEPORT

Tipo/Type   Codigo del estado/State Code   Pasaporte n./Passport No.
P           ESP                             PAH419682
Apellidos / Surname
NAVARRO BELTRAN
Nombre / Given Names
MARIA CARMEN
Nacionalidad / Nationality
ESPANOLA
Fecha de nacimiento / Date of birth
29 09 1986
Sexo / Sex     Lugar de nacimiento / Place of birth
F              SEVILLA
Fecha de expedicion / Date of issue
04 02 2024
Autoridad / Authority
DIRECCION GENERAL DE LA POLICIA
Fecha de caducidad / Date of expiry
04 02 2034

P<ESPNAVARRO<BELTRAN<<MARIA<CARMEN<<<<<<<<<<
PAH4196820ESP8609292F3402041<<<<<<<<<<<<<<08
`;

describe("parseDocumentText — Spanish passport (TD3 MRZ)", () => {
  const r = parseDocumentText(ES_PASSPORT);
  it("TD3 path", () => expect(r.source).toBe("mrz-td3"));
  it("first name", () => expect(r.firstName).toBe("Maria"));
  it("compound surname", () => expect(r.lastName).toBe("Navarro Beltran"));
  it("doc number", () => expect(r.docNumber).toBe("PAH419682"));
  it("expiry (Fecha de caducidad)", () => expect(r.expiryISO).toBe("2034-02-04"));
  it("country", () => expect(r.country).toBe("Spain"));
});

// ─── 8. Spanish DNI (TD1) ───────────────────────────────────────────────
const ES_DNI = `
REINO DE ESPANA
DOCUMENTO NACIONAL DE IDENTIDAD

PRIMER APELLIDO
GUTIERREZ
SEGUNDO APELLIDO
ARENAS
NOMBRE
DAVID
SEXO   NACIONALIDAD
M      ESP
FECHA DE NACIMIENTO     17 03 1993
IDESP    NUM SOPORTE     BHL524917
DNI                     49823517T
FECHA DE CADUCIDAD      22 08 2031

IDESPBHL5249174<<<<<<<<<<<<<<<
9303171M3108223ESP<<<<<<<<<<<4
GUTIERREZ<ARENAS<<DAVID<<<<<<<
`;

describe("parseDocumentText — Spanish DNI (TD1 MRZ)", () => {
  const r = parseDocumentText(ES_DNI);
  it("TD1 path", () => expect(r.source).toBe("mrz-td1"));
  it("first name", () => expect(r.firstName).toBe("David"));
  it("compound surname (Primer + Segundo)", () =>
    expect(r.lastName).toBe("Gutierrez Arenas"));
  it("prefers user-facing DNI over MRZ support number", () =>
    expect(r.docNumber).toBe("49823517T"));
  it("expiry from MRZ line 2", () => expect(r.expiryISO).toBe("2031-08-22"));
  it("country", () => expect(r.country).toBe("Spain"));
});

// ─── Degenerate cases ───────────────────────────────────────────────────
describe("parseDocumentText — degenerate input", () => {
  it("empty text → all empty + source 'none'", () => {
    const r = parseDocumentText("");
    expect(r).toMatchObject({
      firstName: "", lastName: "", docNumber: "", expiryISO: "", country: "", source: "none",
    });
  });
  it("nothing recognisable → empty fields, no spurious docNumber", () => {
    const r = parseDocumentText("Random unrelated photo of a cat sitting on a mat.");
    expect(r.firstName).toBe("");
    expect(r.docNumber).toBe("");
    expect(r.expiryISO).toBe("");
  });
});

// ─── MRZ noise tolerance ────────────────────────────────────────────────
const NOISY_US_PASSPORT = `
UNITED STATES OF AMERICA
sa Passport No.
P USA 987654321

Date of expiration: 22 SEP 2032

Pheaopugesssanjasdfasf

P<USAJONES<<EMMA<ROSE<<<<<<<<<<<<<<<<<<KK<<
9876543210USA9203157F3209225<<<<<<<<<<<<<<00
`;

describe("parseDocumentText — noisy MRZ", () => {
  const r = parseDocumentText(NOISY_US_PASSPORT);
  it("still finds the MRZ when surrounded by junk", () => {
    expect(r.source).toBe("mrz-td3");
  });
  it("extracts the passport number", () => expect(r.docNumber).toBe("987654321"));
  it("extracts the expiry", () => expect(r.expiryISO).toBe("2032-09-22"));
  it("extracts names", () => {
    expect(r.firstName).toBe("Emma");
    expect(r.lastName).toBe("Jones");
  });
});
