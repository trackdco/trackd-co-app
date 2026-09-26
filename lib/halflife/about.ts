/**
 * "About <compound>" on a compound's half-life page (Adrian's walk, W4): a
 * short summary of WHAT the compound is. Facts only: what kind of compound it
 * is, what it acts on, and where it is approved as a medicine. Never what it
 * does for you, what to take, or when (Apple 1.4.2): the app reports and never
 * recommends.
 *
 * The catalogue (`supabase/seed/compounds.csv`) has no descriptions, and the
 * old design's folded About row only restated the half-life, so the summaries
 * live here, keyed by exact catalogue name. Every compound that can have a
 * half-life page has one (tested): the catalogue's compounds with a half-life,
 * and the ones made of parts (a blend, CJC-1295 + Ipamorelin, NDT). A compound
 * with none (a custom one) shows no About row at all.
 *
 * Pure data and one lookup: no React, no storage.
 */

const ABOUT: Record<string, string> = {
  /* ---------------------------------------------------- anabolics, injected */
  "Testosterone Enanthate":
    "Testosterone, the main male sex hormone, joined to an enanthate ester so it releases slowly from an oil injection.",
  "Testosterone Cypionate":
    "Testosterone joined to a cypionate ester, which releases it slowly from an oil injection. The form most often prescribed for TRT in the US.",
  "Testosterone Propionate":
    "Testosterone joined to a short propionate ester, so it releases over days rather than a week or more.",
  "Testosterone Phenylpropionate":
    "Testosterone joined to a phenylpropionate ester, which releases it over a few days. One of the four esters in Sustanon.",
  "Testosterone Undecanoate (injectable)":
    "Testosterone joined to a long undecanoate ester, which releases it over weeks from an oil injection. Sold as Nebido and Aveed.",
  "Testosterone Undecanoate (oral)":
    "Testosterone undecanoate in a capsule taken by mouth, absorbed through the lymphatic system. Sold as Andriol and Jatenzo.",
  "Testosterone Suspension":
    "Testosterone with no ester, suspended in water, so it acts and clears quickly.",
  "Sustanon 250":
    "Four testosterone esters in one oil injection (propionate, phenylpropionate, isocaproate and decanoate), so it releases over a long spread.",
  "Nandrolone Decanoate":
    "Nandrolone, an anabolic steroid made from testosterone, joined to a long decanoate ester. Sold as Deca-Durabolin.",
  "Nandrolone Phenylpropionate":
    "Nandrolone, an anabolic steroid made from testosterone, joined to a shorter phenylpropionate ester. Known as NPP.",
  "Trenbolone Acetate":
    "Trenbolone, a synthetic anabolic steroid first made for livestock, joined to a short acetate ester.",
  "Trenbolone Enanthate":
    "Trenbolone, a synthetic anabolic steroid first made for livestock, joined to a longer enanthate ester.",
  "Trenbolone Hexahydrobenzylcarbonate":
    "Trenbolone joined to a long hexahydrobenzylcarbonate ester. Once sold for human use in France as Parabolan.",
  "Boldenone Undecylenate":
    "Boldenone, an anabolic steroid close to testosterone, joined to a long undecylenate ester. Sold for horses as Equipoise.",
  "Drostanolone Propionate":
    "Drostanolone, an anabolic steroid made from DHT, joined to a short propionate ester. Known as Masteron.",
  "Drostanolone Enanthate":
    "Drostanolone, an anabolic steroid made from DHT, joined to a longer enanthate ester. Known as Masteron.",
  "Methenolone Enanthate":
    "Methenolone, an anabolic steroid made from DHT, joined to an enanthate ester for injection. Known as Primobolan Depot.",
  "Stanozolol (injectable)":
    "Stanozolol, an anabolic steroid made from DHT, as a water-based injection. Known as Winstrol Depot.",
  "Dihydroboldenone":
    "An anabolic steroid also called 1-testosterone, a DHT-like form of boldenone. Known as DHB.",
  "Trestolone Acetate":
    "Trestolone, a synthetic steroid made from nandrolone and first studied as a male contraceptive, joined to an acetate ester. Also called MENT.",

  /* ------------------------------------------------------ anabolics, oral */
  "Oxandrolone":
    "An oral anabolic steroid made from DHT, once prescribed to help regain weight after illness or injury. Known as Anavar.",
  "Stanozolol (oral)": "Stanozolol, an anabolic steroid made from DHT, as a tablet. Known as Winstrol.",
  "Methandrostenolone": "An oral anabolic steroid made from testosterone. Known as Dianabol.",
  "Oxymetholone":
    "An oral anabolic steroid made from DHT, prescribed for some kinds of anaemia. Known as Anadrol.",
  "Methasterone": "An oral anabolic steroid made from DHT, once sold as a supplement. Known as Superdrol.",
  "Methenolone Acetate": "Methenolone, an anabolic steroid made from DHT, as an oral acetate tablet. Known as Primobolan.",
  "Fluoxymesterone": "A potent oral androgen made from testosterone. Known as Halotestin.",
  "Mesterolone": "An oral androgen made from DHT. Known as Proviron.",
  "Turinabol": "Chlorodehydromethyltestosterone, an oral anabolic steroid made from Dianabol.",
  "Methyltestosterone":
    "Testosterone with a methyl group added so it survives being taken by mouth. Prescribed in some countries for low testosterone.",

  /* ------------------------------------------------------------------ SARMs */
  "Ostarine":
    "A selective androgen receptor modulator (SARM), also called enobosarm or MK-2866. Studied in clinical trials; not approved as a medicine.",
  "Ligandrol":
    "A selective androgen receptor modulator (SARM), also called LGD-4033. Studied in clinical trials; not approved as a medicine.",
  "Testolone": "A selective androgen receptor modulator (SARM), also called RAD-140. Not approved as a medicine.",
  "Andarine": "A selective androgen receptor modulator (SARM), also called S-4. Not approved as a medicine.",
  "S-23": "A selective androgen receptor modulator (SARM) from lab research. Not approved as a medicine.",
  "YK-11": "A steroid-based compound that acts on the androgen receptor, studied in the lab. Not approved as a medicine.",
  "Cardarine":
    "A PPAR-delta agonist, also called GW501516. Not a SARM, though often grouped with them. Its development stopped in 2007.",
  "Stenabolic":
    "SR9009, a compound that acts on the Rev-Erb proteins of the body clock. Studied in the lab; not approved as a medicine.",

  /* --------------------------------------------------------------- peptides */
  "Somatropin (HGH)": "Human growth hormone, made by recombinant DNA. Prescribed for growth hormone deficiency.",
  "CJC-1295 DAC":
    "A synthetic GHRH analogue with a Drug Affinity Complex that binds it to albumin, so it lasts for days. It prompts the pituitary to release growth hormone.",
  "CJC-1295 (no DAC)":
    "A synthetic GHRH analogue, also called Mod GRF 1-29. It prompts the pituitary to release growth hormone in short pulses.",
  "Ipamorelin":
    "A synthetic peptide that acts on the ghrelin receptor, prompting the pituitary to release growth hormone.",
  "Sermorelin":
    "A shortened copy of the body’s own GHRH, its first 29 amino acids. It prompts the pituitary to release growth hormone.",
  "Tesamorelin":
    "A synthetic GHRH analogue. Approved as Egrifta to reduce abdominal fat in people with HIV.",
  "GHRP-2":
    "Growth hormone releasing peptide 2, a synthetic peptide that acts on the ghrelin receptor to prompt a release of growth hormone.",
  "GHRP-6":
    "Growth hormone releasing peptide 6, a synthetic peptide that acts on the ghrelin receptor to prompt a release of growth hormone.",
  "Hexarelin": "A synthetic six amino acid peptide from the GHRP family that acts on the ghrelin receptor.",
  "BPC-157":
    "A synthetic peptide of 15 amino acids, based on a protein found in gastric juice. Studied in animals; not approved as a medicine.",
  "TB-500":
    "A synthetic peptide based on part of thymosin beta-4, a protein found in most cells. Not approved as a medicine.",
  "IGF-1 LR3":
    "A modified form of insulin-like growth factor 1 (IGF-1), built to bind less to its binding proteins so it lasts longer.",
  "Melanotan II": "A synthetic analogue of alpha-MSH, the hormone that darkens skin. Not approved as a medicine.",
  "PT-141":
    "Bremelanotide, a peptide made from Melanotan II that acts on melanocortin receptors in the brain. Approved as Vyleesi.",
  "Semaglutide":
    "A long-acting GLP-1 receptor agonist, based on a gut hormone involved in appetite and blood sugar. Approved as Ozempic and Wegovy.",
  "Tirzepatide":
    "A dual GIP and GLP-1 receptor agonist, acting like two gut hormones at once. Approved as Mounjaro and Zepbound.",
  "Retatrutide": "A triple agonist of the GLP-1, GIP and glucagon receptors. Studied in clinical trials.",
  "AOD-9604":
    "A modified fragment of human growth hormone, amino acids 176 to 191. Not approved as a medicine.",
  "Epitalon":
    "A synthetic peptide of four amino acids, based on an extract of the pineal gland. Not approved as a medicine.",
  "5-Amino-1MQ":
    "A small molecule, not a peptide, that blocks the enzyme NNMT. Studied in the lab; not approved as a medicine.",
  "MK-677":
    "Ibutamoren, a compound taken by mouth (not a peptide) that acts on the ghrelin receptor to prompt a release of growth hormone. Not approved as a medicine.",
  "Follistatin-344":
    "A form of follistatin, a protein the body makes that binds myostatin and activin. Not approved as a medicine.",
  "GHK-Cu":
    "A copper peptide: three amino acids (glycine, histidine and lysine) bound to copper, found naturally in the body. Used in skin care.",
  "Thymosin Alpha-1": "A peptide of 28 amino acids first found in the thymus. Approved in some countries as Zadaxin.",
  "SS-31": "Elamipretide, a small peptide that targets the inner membrane of mitochondria. Studied in clinical trials.",
  "Kisspeptin":
    "Kisspeptin-10, the shortest active form of kisspeptin, a hormone from the brain that prompts the release of LH and FSH.",
  "Kisspeptin-54": "The full 54 amino acid form of kisspeptin, a hormone from the brain that prompts the release of LH and FSH.",
  "Melanotan I": "Afamelanotide, a synthetic analogue of alpha-MSH. Approved as Scenesse for a rare sensitivity to light.",
  "Cagrilintide":
    "A long-acting analogue of amylin, a hormone released with insulin. Studied with semaglutide as CagriSema.",
  "Liraglutide": "A GLP-1 receptor agonist, based on a gut hormone involved in appetite and blood sugar. Approved as Victoza and Saxenda.",
  "Survodutide": "A dual agonist of the glucagon and GLP-1 receptors. Studied in clinical trials.",
  "Mazdutide": "A dual agonist of the GLP-1 and glucagon receptors, also called IBI362.",

  /* ------------------------------------------------- made of more than one */
  "CJC-1295 + Ipamorelin":
    "Two peptides in one vial: CJC-1295 (no DAC), a GHRH analogue, and Ipamorelin, which acts on the ghrelin receptor. Both prompt a release of growth hormone.",
  "Wolverine (BPC-157 + TB-500)": "A blend of two peptides in one vial: BPC-157 and TB-500.",
  "Glow (BPC-157 + TB-500 + GHK-Cu)": "A blend of three peptides in one vial: BPC-157, TB-500 and GHK-Cu.",
  "KLOW (BPC-157 + TB-500 + GHK-Cu + KPV)": "A blend of four peptides in one vial: BPC-157, TB-500, GHK-Cu and KPV.",
  "Natural Desiccated Thyroid":
    "Dried pig thyroid gland, holding both thyroid hormones, T4 and T3. Sold as Armour Thyroid.",

  /* ------------------------------------------------------------ ancillaries */
  "Anastrozole":
    "An aromatase inhibitor: it lowers how much testosterone the body turns into estrogen. Approved as Arimidex for breast cancer.",
  "Exemestane":
    "A steroidal aromatase inhibitor that binds the enzyme for good. Approved as Aromasin for breast cancer.",
  "Letrozole":
    "An aromatase inhibitor: it lowers how much testosterone the body turns into estrogen. Approved as Femara for breast cancer.",
  "Tamoxifen":
    "A selective estrogen receptor modulator (SERM) that blocks estrogen in some tissues, such as the breast. Approved as Nolvadex for breast cancer.",
  "Clomiphene":
    "A selective estrogen receptor modulator (SERM) that blocks estrogen’s feedback to the brain, which raises LH and FSH. Approved as Clomid for fertility.",
  "Enclomiphene":
    "The trans isomer of clomiphene, a SERM that blocks estrogen’s feedback to the brain, which raises LH and FSH.",
  "Toremifene":
    "A selective estrogen receptor modulator (SERM) close to tamoxifen. Approved as Fareston for breast cancer.",
  "Raloxifene":
    "A selective estrogen receptor modulator (SERM). Approved as Evista for osteoporosis after menopause.",
  "Cabergoline": "A dopamine agonist that lowers prolactin. Approved as Dostinex for high prolactin.",
  "Pramipexole": "A dopamine agonist. Approved as Mirapex for Parkinson’s disease and restless legs syndrome.",
  "HCG":
    "Human chorionic gonadotropin, a hormone that acts like LH on the testes and ovaries. Approved for fertility treatment.",
  "Gonadorelin": "A synthetic copy of GnRH, the brain hormone that prompts the release of LH and FSH.",
  "Finasteride":
    "A 5-alpha reductase inhibitor: it lowers how much testosterone becomes DHT. Approved as Propecia and Proscar.",
  "Dutasteride":
    "A 5-alpha reductase inhibitor that blocks both forms of the enzyme, so it lowers DHT further than finasteride. Approved as Avodart.",
  "Tadalafil": "A PDE5 inhibitor that relaxes the smooth muscle of blood vessels. Approved as Cialis.",
  "Sildenafil": "A PDE5 inhibitor that relaxes the smooth muscle of blood vessels. Approved as Viagra and Revatio.",
  "Telmisartan": "An angiotensin II receptor blocker. Approved as Micardis for high blood pressure.",
  "Isotretinoin": "A retinoid, a form of vitamin A. Approved for severe acne, sold as Accutane and Roaccutane.",
  "hMG":
    "Human menopausal gonadotropin, a mix of FSH and LH purified from urine. Approved for fertility treatment.",
  "Bromocriptine": "A dopamine agonist that lowers prolactin. Approved as Parlodel.",
  "Metformin": "A biguanide that lowers how much glucose the liver releases. Approved for type 2 diabetes.",

  /* ---------------------------------------------------------------- thyroid */
  "Liothyronine (T3)": "Synthetic T3, the active thyroid hormone. Approved as Cytomel.",
  "Levothyroxine (T4)":
    "Synthetic T4, the main hormone the thyroid makes, which the body turns into T3. Approved as Synthroid and others.",

  /* ------------------------------------------------------------- stimulants */
  "Clenbuterol":
    "A beta-2 agonist that opens the airways. Approved for asthma in some countries; not approved for people in the US.",
  "Ephedrine": "A stimulant from the ephedra plant that acts on adrenaline receptors. Used in hospitals for low blood pressure.",
  "Yohimbine": "An alpha-2 receptor blocker from the bark of the yohimbe tree.",
  "Salbutamol": "A short-acting beta-2 agonist that opens the airways. Also called albuterol; sold as Ventolin.",
  "DNP":
    "2,4-Dinitrophenol, an industrial chemical that makes cells burn energy as heat. Not approved for people, and it has caused deaths.",
  "Modafinil": "A wakefulness drug. Approved as Provigil for narcolepsy and shift work sleep disorder.",
  "Armodafinil": "The longer-lasting form of modafinil, its R-enantiomer. Approved as Nuvigil.",
  "Phentermine": "A stimulant appetite suppressant related to amphetamine. Approved for short-term weight loss.",
  "Synephrine": "A stimulant found in bitter orange peel, close to ephedrine in structure.",
}

const byName = new Map(Object.entries(ABOUT).map(([name, text]) => [name.trim().toLowerCase(), text]))

/** The summary of what this compound is, by exact catalogue name, or null
 *  when there is none (a custom compound): then no About row is shown. */
export function aboutFor(name: string): string | null {
  return byName.get(name.trim().toLowerCase()) ?? null
}

/** Every name with a summary (for the tests). */
export const ABOUT_NAMES: readonly string[] = Object.keys(ABOUT)
