/* Pengaturan bawaan (rate, teks polis, tampilan) & daftar kendaraan bawaan.
   Nilai ini dipakai sampai admin menyimpan pengaturan ke Firestore. */
export const EXT_DEFS = [
  { key: "flood", label: "Angin Topan, Badai, Hujan Es, Banjir & Tanah Longsor" },
  { key: "eq", label: "Gempa Bumi, Tsunami & Letusan Gunung Berapi" },
  { key: "srcc", label: "Huru-hara & Kerusuhan (SRCC)" },
  { key: "ts", label: "Terorisme & Sabotase" },
  { key: "workshop", label: "Bengkel Resmi (Authorized Workshop)" }
];
export const COVER_LABEL = { comprehensive: "Comprehensive (All Risk)", tlo: "Total Loss Only (TLO)" };

export const DEFAULT_SETTINGS = {
  company: {
    brand: "ALEX INSURANCE", logo: "AI", name: "PT. Asuransi Umum Mega",
    address: "", phone: "", email: "", city: "Banda Aceh", signer: "", prefix: "QS"
  },
  region: "Wilayah 1",
  tiers: {
    comprehensive: [
      { max: 125e6, rate: 3.82 }, { max: 200e6, rate: 2.67 }, { max: 400e6, rate: 2.18 },
      { max: 800e6, rate: 1.2 }, { max: null, rate: 1.05 }
    ],
    tlo: [
      { max: 125e6, rate: 0.47 }, { max: 200e6, rate: 0.63 }, { max: 400e6, rate: 0.41 },
      { max: 800e6, rate: 0.25 }, { max: null, rate: 0.2 }
    ]
  },
  ext: { flood: 0.075, eq: 0.12, srcc: 0.05, ts: 0.05, workshop: 0.15 },
  tjhRate: 1, paDriverRate: 0.5, paPassRate: 0.5, paPassPerSeat: false,
  tjhLimits: [5e6, 10e6, 15e6, 20e6, 25e6],
  paLimits: [10e6, 25e6, 50e6, 100e6],
  ageLoading: { enabled: true, afterYears: 5, pctPerYear: 5 },
  policyCost: 24000, stampDuty: 10000, maxDiscount: 0, validityDays: 14,
  paymentTerm: "30 hari sejak tanggal mulai pertanggungan",
  display: {
    quick: true, history: true, autoSave: true, tlo: true,
    ext: { flood: true, eq: true, srcc: true, ts: true, workshop: true },
    tjh: true, paD: true, paP: true, formula: true, pdfFormula: true
  },
  texts: {
    deductible: [
      "Kerugian Total : 10% dari Harga Pertanggungan",
      "Kerugian Sebagian : IDR 300.000 untuk setiap kejadian",
      "Gempa Bumi : 10% dari klaim, minimum IDR 500.000 untuk setiap kejadian",
      "Banjir : 10% dari klaim, minimum IDR 500.000 untuk setiap kejadian",
      "RSCC : 10% dari klaim, minimum IDR 500.000 untuk setiap kejadian",
      "Tanggung Jawab Hukum Pihak Ketiga, Kecelakaan Diri/PA dan Medical Expenses : Nil"
    ].join("\n"),
    clauses: [
      "Klausul Set dan Pasangan", "Communicable Disease Exclusion Endorsement Clause",
      "Cyber Loss Limited Exclusion Clause", "Electronic Date Recognition Exclusion (NMA 2800)",
      "Information Technology Hazards Clarification Clause (NMA 2912)", "Infectious Disease Exclusion - Paramount Clause",
      "Klausul Gempa Bumi, Tsunami dan atau Letusan Gunung Berapi (Apabila Ada)",
      "Klausul Angin Topan, Badai, Hujan Es, Banjir dan atau Tanah Longsor (Apabila Ada)",
      "Klausul Tanggung Jawab Hukum terhadap Pihak Ketiga (Apabila Ada)", "Klausul Kecelakaan Diri (Apabila Ada)",
      "Klausula Authorized (Apabila Ada)", "Klausula Komponen Kendaraan Bermotor", "Klausul Pembayaran Premi (30 Hari)",
      "Klausul Penggelapan atau Pencurian", "SRCC Clause (Apabila Ada)", "Waiver Clause (Article 1266 & 1267 KUHPer)"
    ].join("\n"),
    subjectivity: [
      "Satisfactory survey result", "Submit STNK and ID valid/active before bind", "STNC until bind date",
      "Private/business usage only", "Good condition, maintenance and operation",
      "Clean loss record and warranted no known or reported losses by any party up to binding date",
      "Rate as per OJK regulation", "No deterioration of loss record up to binding",
      "Exclude ex-gratia and or compromise loss settlement", "Exclude to any paintbrush, airbrush and sticker",
      "Exclude water hammer"
    ].join("\n"),
    disclaimer: "Calon tertanggung wajib membaca penawaran ini secara keseluruhan dan memberikan persetujuan tertulis untuk proses penerbitan polis. Apabila kami menerima instruksi penerbitan polis, calon tertanggung dianggap telah memahami dan menyetujui penawaran ini. Penawaran ini tunduk pada polis yang akan diterbitkan oleh perusahaan asuransi; apabila terdapat perbedaan ketentuan, maka ketentuan dalam polis yang berlaku."
  }
};

/* ====================== DATABASE KENDARAAN BAWAAN ====================== */
const VEHICLE_RAW = `
Toyota|LCGC|Agya 1.2 E M/T;Agya 1.2 G CVT;Agya GR Sport CVT;Calya 1.2 E M/T;Calya 1.2 G A/T
Toyota|MPV|Avanza 1.3 E M/T;Avanza 1.5 G CVT;Veloz 1.5 Q CVT;Veloz 1.5 Q CVT TSS;Sienta 1.5 V CVT;Kijang Innova Reborn 2.4 G Diesel M/T;Kijang Innova Reborn 2.4 V Diesel A/T;Kijang Innova Zenix 2.0 G CVT;Kijang Innova Zenix 2.0 V Hybrid;Kijang Innova Zenix 2.0 Q Hybrid;Voxy 2.0 CVT;Alphard 2.5 G A/T;Alphard 2.5 X Hybrid A/T;Alphard 2.5 G Hybrid A/T;Vellfire 2.5 Hybrid A/T
Toyota|SUV|Raize 1.2 G CVT;Raize 1.0 GR Sport Turbo CVT;Rush 1.5 G A/T;Rush 1.5 GR Sport A/T;Yaris Cross 1.5 G CVT;Yaris Cross 1.5 S Hybrid;Corolla Cross 1.8 V CVT;Corolla Cross 1.8 Hybrid;Fortuner 2.4 G A/T;Fortuner 2.4 VRZ A/T;Fortuner 2.8 GR Sport A/T;RAV4 2.5 PHEV;Land Cruiser 300 3.3 Diesel;bZ4X EV
Toyota|Hatchback|Yaris 1.5 G CVT;Yaris 1.5 S GR Sport CVT;GR Yaris;GR86
Toyota|Sedan|Vios 1.5 G CVT;Corolla Altis 1.8 V CVT;Corolla Altis 1.8 Hybrid;Camry 2.5 V A/T;Camry 2.5 Hybrid
Toyota|Pickup|Hilux S-Cab 2.4 Diesel;Hilux D-Cab 2.4 E M/T;Hilux D-Cab 2.4 V A/T;Hilux Rangga 2.0 Bensin
Toyota|Minibus|HiAce Commuter 2.8 Diesel;HiAce Premio 2.8 Diesel
Daihatsu|LCGC|Ayla 1.0 M M/T;Ayla 1.2 X CVT;Ayla 1.2 R CVT;Sigra 1.0 D M/T;Sigra 1.2 R A/T
Daihatsu|MPV|Xenia 1.3 X M/T;Xenia 1.5 R CVT;Gran Max MB 1.5;Luxio 1.5 X A/T
Daihatsu|SUV|Rocky 1.2 X CVT;Rocky 1.0 R Turbo CVT;Terios 1.5 X A/T;Terios 1.5 R A/T
Daihatsu|Pickup|Gran Max PU 1.3;Gran Max PU 1.5
Honda|LCGC|Brio Satya 1.2 E CVT
Honda|Hatchback|Brio 1.2 RS CVT;City Hatchback RS CVT;Civic Type R
Honda|Sedan|City 1.5 RS CVT;Civic 1.5 RS Turbo;Civic e:HEV RS;Accord 2.0 e:HEV
Honda|MPV|Mobilio 1.5 E CVT;Mobilio 1.5 RS CVT;BR-V 1.5 E CVT;BR-V 1.5 Prestige CVT;Odyssey 2.4 A/T
Honda|SUV|WR-V 1.5 E CVT;WR-V 1.5 RS CVT;HR-V 1.5 E CVT;HR-V 1.5 RS Turbo;HR-V e:HEV;CR-V 1.5 Turbo;CR-V 2.0 e:HEV RS
Mitsubishi|MPV|Xpander 1.5 GLS M/T;Xpander 1.5 Exceed CVT;Xpander 1.5 Ultimate CVT;Xpander Cross 1.5 CVT;Xpander Cross Hybrid
Mitsubishi|SUV|Xforce 1.5 Exceed CVT;Xforce 1.5 Ultimate CVT;Outlander PHEV;Pajero Sport 2.4 Exceed 4x2 A/T;Pajero Sport 2.4 Dakar 4x2 A/T;Pajero Sport 2.4 Dakar Ultimate 4x4 A/T
Mitsubishi|Pickup|L300 2.2 Diesel;Triton 2.4 GLX D-Cab;Triton 2.4 Exceed A/T;Triton Athlete A/T
Mitsubishi|EV|L100 EV
Suzuki|MPV|Ertiga 1.5 GL M/T;Ertiga 1.5 GX A/T Hybrid;Ertiga Cruise Hybrid;XL7 1.5 Zeta A/T;XL7 1.5 Alpha Hybrid;APV Arena 1.5
Suzuki|Hatchback|Baleno 1.5 A/T;Swift 1.2 GL CVT;Ignis 1.2 GX AGS;S-Presso 1.0 AGS
Suzuki|SUV|Fronx 1.5 GX A/T;Fronx 1.5 SGX Hybrid;Grand Vitara 1.5 Hybrid;Jimny 5-Door 1.5 A/T;Jimny 3-Door 1.5 A/T
Suzuki|Pickup|Carry Pick Up 1.5;Carry Pick Up 1.5 Wide Deck
Nissan|MPV|Livina 1.5 E M/T;Livina 1.5 VL CVT;Serena e-Power
Nissan|SUV|Magnite 1.0 Turbo CVT;Kicks e-Power;X-Trail 1.5 e-Power;Terra 2.5 VL A/T
Nissan|EV|Leaf EV
Nissan|Pickup|Navara 2.5 VL A/T
Mazda|Hatchback|Mazda2 1.5 GT A/T;Mazda3 Hatchback 2.0 A/T
Mazda|Sedan|Mazda3 Sedan 2.0 A/T;Mazda6 2.5 A/T
Mazda|SUV|CX-3 2.0 Pro A/T;CX-30 2.0 GT A/T;CX-5 2.5 Elite A/T;CX-60 2.5 Pro A/T;CX-8 2.5 Elite A/T;CX-9 Turbo A/T
Mazda|Sport|MX-5 RF
Hyundai|MPV|Stargazer 1.5 Prime IVT;Stargazer X 1.5 IVT;Staria 2.2 Signature
Hyundai|SUV|Creta 1.5 Prime IVT;Creta N Line Turbo;Santa Fe 2.5 Turbo;Santa Fe Hybrid;Palisade 2.2 Signature
Hyundai|EV|Ioniq 5 Signature Long Range;Ioniq 6;Kona Electric;Ioniq 5 N
Kia|SUV|Sonet 1.5 Premiere IVT;Seltos 1.5 EXP;Sportage 1.6 Turbo;Sorento 2.2 Diesel
Kia|MPV|Carens 1.5 IVT;Carnival 2.2 Diesel
Kia|EV|EV6 GT-Line;EV9
Kia|Hatchback|Picanto 1.2 GT-Line A/T
Wuling|MPV|Confero S 1.5 M/T;Cortez 1.5 Turbo CVT;Cortez Darion PHEV;Formo S 1.5 M/T
Wuling|SUV|Almaz RS Pro Turbo;Almaz Hybrid;Alvez 1.5 CVT
Wuling|EV|Air ev Standard Range;Air ev Long Range;BinguoEV Long Range;Cloud EV
Chery|SUV|Tiggo 5X 1.5 CVT;Tiggo 7 Pro 1.5 Turbo;Tiggo 8 Pro 1.6 Turbo;Tiggo 8 CSH Hybrid;Omoda 5 1.5 Turbo
Chery|EV|Omoda E5;J6 EV
DFSK|SUV|Glory 560 1.5 Turbo CVT;Glory i-Auto 1.5 Turbo;Seres E1 EV;Gelora E EV
DFSK|Pickup|Super Cab 1.5 Diesel
BYD|EV|Dolphin;Atto 3;Seal Premium;Seal Performance AWD;M6 Superior;Sealion 7
MG|SUV|ZS 1.5 Magnify;HS 1.5 Turbo;MG4 EV;ZS EV
MG|Sedan|MG5 GT 1.5 CVT
Isuzu|SUV|MU-X 1.9 Diesel A/T
Isuzu|Pickup|D-Max 1.9 S-Cab;D-Max 1.9 D-Cab A/T;Traga 2.5 Diesel
Isuzu|Minibus|Elf NLR 55 B Microbus
Mercedes-Benz|Sedan|C 200 Avantgarde;C 300 AMG Line;E 300 AMG Line;S 450 L;EQE 350+
Mercedes-Benz|SUV|GLA 200;GLB 200;GLC 300 4MATIC;GLE 450 4MATIC;GLS 450 4MATIC;G 63 AMG;EQA 250;EQB 250
Mercedes-Benz|MPV|V 260 Avantgarde
BMW|Sedan|320i Sport;330i M Sport;520i M Sport;530i M Sport;i4 eDrive40;i7 xDrive60;740Li
BMW|SUV|X1 sDrive18i;X3 sDrive20i;X5 xDrive40i;X7 xDrive40i;iX xDrive40;iX1 eDrive20
Lexus|Sedan|ES 300h;LS 500h
Lexus|SUV|UX 300e;NX 350h;RX 350h;RX 500h F Sport;LX 600;LBX
Lexus|MPV|LM 350h
Volkswagen|SUV|Tiguan Allspace 1.4 TSI;ID.4
Volkswagen|Hatchback|Polo 1.0 TSI;Golf GTI
Audi|Sedan|A4 45 TFSI;A6 45 TFSI;e-tron GT
Audi|SUV|Q3 35 TFSI;Q5 45 TFSI;Q7 55 TFSI;Q8 e-tron
Ford|Pickup|Ranger XLT D-Cab;Ranger Wildtrak 2.0 Bi-Turbo;Ranger Raptor
Ford|SUV|Everest Titanium 2.0 Bi-Turbo
Subaru|SUV|Forester 2.0 i-L;Crosstrek 2.0;XV 2.0 i-S;Solterra EV
Subaru|Sport|BRZ 2.4;WRX 2.4 Turbo
Jeep|SUV|Wrangler Rubicon;Grand Cherokee Limited;Compass Limited
Land Rover|SUV|Defender 110 P300;Range Rover Evoque;Range Rover Sport;Range Rover Velar;Discovery Sport
Volvo|SUV|XC40 Recharge;XC60 B5;XC90 B6;EX30
Porsche|SUV|Macan;Cayenne;Cayenne Coupe
Porsche|Sport|911 Carrera;Taycan;Panamera 4
Peugeot|SUV|2008 1.2 Turbo;3008 1.6 Turbo;5008 1.6 Turbo
Citroen|SUV|C3 1.2 Shine;C3 Aircross 1.2;e-C3 EV
Geely|EV|EX5;Starray
Aion|EV|Aion Y Plus;Aion V;Hyptec HT
Neta|EV|Neta V-II;Neta X
VinFast|EV|VF 3;VF 5;VF e34;VF 6;VF 7
Jaecoo|SUV|J7 1.6 Turbo;J7 SHS PHEV
Polytron|EV|G3
`;
function parseVehicles(raw) {
  const out = [];
  raw.trim().split("\n").forEach(line => {
    const [brand, type, models] = line.split("|");
    (models || "").split(";").map(s => s.trim()).filter(Boolean)
      .forEach(model => out.push({ brand: brand.trim(), type: type.trim(), model, price: 0 }));
  });
  return out;
}
export const DEFAULT_VEHICLES = parseVehicles(VEHICLE_RAW);
