// Independently compared Wago DB2 exports for 1.60.1.71037 and 1.60.1.71091, 2026-11-25.
export const PET_DB2_REVIEWED_BUILD='1.60.1.71091';
export const PET_DB2_BASELINE={
  "family": {
    "table": "CreatureFamily",
    "filter": "ID",
    "value": 319,
    "header": "ID,Name_lang,MinScale,MinScaleLevel,MaxScale,MaxScaleLevel,PetFoodMask,PetTalentType,CategoryEnumID,IconFileID,SkillLine_0,SkillLine_1",
    "rows": [
      "319,Fox,0.5,1,0.80000001192,60,1,0,0,458223,3016,270"
    ]
  },
  "passive": {
    "table": "SpellEffect",
    "filter": "SpellID",
    "value": 17223,
    "header": "ID,EffectAura,DifficultyID,EffectIndex,Effect,EffectAmplitude,EffectAttributes,EffectAuraPeriod,EffectBonusCoefficient,EffectChainAmplitude,EffectChainTargets,EffectItemType,EffectMechanic,EffectPointsPerResource,EffectPos_facing,EffectRealPointsPerLevel,EffectTriggerSpell,BonusCoefficientFromAP,PvpMultiplier,Coefficient,Variance,ResourceCoefficient,GroupSizeBasePointsCoefficient,EffectBasePointsF,ScalingClass,Node__Field_12_0_0_63534_001,EffectMiscValue_0,EffectMiscValue_1,EffectRadiusIndex_0,EffectRadiusIndex_1,EffectSpellClassMask_0,EffectSpellClassMask_1,EffectSpellClassMask_2,EffectSpellClassMask_3,ImplicitTarget_0,ImplicitTarget_1,SpellID",
    "rows": [
      "694005,79,0,0,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,1,0,17223",
      "694006,142,0,1,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,5,0,0,1,0,0,0,0,0,0,0,1,0,17223",
      "694007,133,0,2,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,17223"
    ]
  },
  "scaling": {
    "table": "SpellEffect",
    "filter": "SpellID",
    "value": 415429,
    "header": "ID,EffectAura,DifficultyID,EffectIndex,Effect,EffectAmplitude,EffectAttributes,EffectAuraPeriod,EffectBonusCoefficient,EffectChainAmplitude,EffectChainTargets,EffectItemType,EffectMechanic,EffectPointsPerResource,EffectPos_facing,EffectRealPointsPerLevel,EffectTriggerSpell,BonusCoefficientFromAP,PvpMultiplier,Coefficient,Variance,ResourceCoefficient,GroupSizeBasePointsCoefficient,EffectBasePointsF,ScalingClass,Node__Field_12_0_0_63534_001,EffectMiscValue_0,EffectMiscValue_1,EffectRadiusIndex_0,EffectRadiusIndex_1,EffectSpellClassMask_0,EffectSpellClassMask_1,EffectSpellClassMask_2,EffectSpellClassMask_3,ImplicitTarget_0,ImplicitTarget_1,SpellID",
    "rows": [
      "1085356,230,0,0,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,415429",
      "1085357,99,0,1,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,415429",
      "1085358,13,0,2,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,126,0,0,0,0,0,0,0,1,0,415429",
      "1085359,22,0,3,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,4,0,0,0,0,0,0,0,1,0,415429",
      "1085360,22,0,4,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,16,0,0,0,0,0,0,0,1,0,415429",
      "1085361,22,0,5,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,8,0,0,0,0,0,0,0,1,0,415429",
      "1085362,22,0,6,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,32,0,0,0,0,0,0,0,1,0,415429",
      "1085363,22,0,7,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,64,0,0,0,0,0,0,0,1,0,415429",
      "1085364,674,0,8,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,1,0,415429",
      "1085365,54,0,9,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,415429",
      "1085366,55,0,10,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,415429",
      "1085367,319,0,11,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,415429",
      "1085368,65,0,12,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,415429",
      "1085369,52,0,13,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,415429",
      "1085370,57,0,14,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,415429",
      "1202793,418,0,15,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,50,0,0,2,0,0,0,0,0,0,0,1,0,415429",
      "1203046,593,0,16,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,4,0,0,0,0,0,0,0,1,0,415429",
      "1203047,593,0,17,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,2,0,0,0,0,0,0,0,1,0,415429",
      "1346056,49,0,18,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,415429"
    ]
  },
  "focus": {
    "table": "PowerType",
    "filter": "ID",
    "value": 3,
    "header": "NameGlobalStringTag,CostGlobalStringTag,ID,PowerTypeEnum,MinPower,MaxBasePower,CenterPower,DefaultPower,DisplayModifier,RegenInterruptTimeMS,RegenPeace,RegenCombat,Flags",
    "rows": [
      "FOCUS,FOCUS_COST,3,2,0,100,0,100,1,0,10,10,25728"
    ]
  },
  "training": {
    "table": "SkillLineAbility",
    "filter": "SkillLine",
    "value": 3016,
    "header": "AbilityVerb_lang,AbilityAllVerb_lang,ID,SkillLine,Spell,MinSkillLineRank,ClassMask,SupercedesSpell,AcquireMethod,TrivialSkillLineRankHigh,TrivialSkillLineRankLow,Flags,NumSkillUps,UniqueBit,TradeSkillCategoryID,SkillupSkillLineID,Field_5_5_4_67090_014_0,Field_5_5_4_67090_014_1,RaceMasks_0,RaceMasks_1",
    "rows": [
      ",,59177,3016,1310612,1,0,0,0,0,0,0,1,0,0,0,0,10,0,0",
      ",,59180,3016,20784,1,0,0,2,0,0,0,1,0,0,0,0,0,0,0",
      ",,59181,3016,17260,1,0,17259,0,0,0,0,1,0,0,0,0,21,0,0",
      ",,59182,3016,17223,1,0,0,2,0,0,0,1,0,0,0,0,0,0,0",
      ",,59183,3016,17256,1,0,17255,0,0,0,0,1,0,0,0,0,7,0,0",
      ",,59184,3016,17257,1,0,17256,0,0,0,0,1,0,0,0,0,10,0,0",
      ",,59185,3016,17258,1,0,17257,0,0,0,0,1,0,0,0,0,13,0,0",
      ",,59186,3016,17259,1,0,17258,0,0,0,0,1,0,0,0,0,17,0,0",
      ",,59187,3016,17261,1,0,17260,0,0,0,0,1,0,0,0,0,25,0,0",
      ",,59188,3016,415429,1,0,0,2,0,0,0,0,0,0,0,0,0,0,0",
      ",,59189,3016,17253,1,0,0,0,0,0,0,1,0,0,0,0,1,0,0",
      ",,59190,3016,17255,1,0,17253,0,0,0,0,1,0,0,0,0,4,0,0",
      ",,59191,3016,8875,1,0,0,2,0,0,0,1,0,0,0,0,0,0,0",
      ",,59192,3016,23099,1,0,0,0,0,0,0,1,0,0,0,0,15,0,0",
      ",,59193,3016,23109,1,0,23099,0,0,0,0,1,0,0,0,0,20,0,0",
      ",,59194,3016,23110,1,0,23109,0,0,0,0,1,0,0,0,0,25,0,0",
      ",,59195,3016,19589,1,0,0,2,0,0,0,1,0,0,0,0,0,0,0",
      ",,59196,3016,19591,1,0,0,2,0,0,0,1,0,0,0,0,0,0,0",
      ",,59197,3016,19580,1,0,0,2,0,0,0,1,0,0,0,0,0,0,0",
      ",,59198,3016,19581,1,0,0,2,0,0,0,1,0,0,0,0,0,0,0",
      ",,59199,3016,19582,1,0,0,2,0,0,0,1,0,0,0,0,0,0,0",
      ",,59200,3016,20782,1,0,0,2,0,0,0,1,0,0,0,0,0,0,0",
      ",,59201,3016,409365,1,0,0,2,0,0,0,0,0,0,0,0,0,0,0"
    ]
  },
  "power": {
    "table": "SpellPower",
    "filter": null,
    "value": null,
    "header": "ID,OrderIndex,ManaCost,ManaCostPerLevel,ManaPerSecond,PowerDisplayID,AltPowerBarID,PowerCostPct,PowerCostMaxPct,OptionalCostPct,PowerPctPerSecond,PowerType,RequiredAuraSpellID,OptionalCost,SpellID",
    "rows": [
      "181831,0,35,0,0,0,0,0,0,0,0,2,0,0,17261",
      "181873,0,35,0,0,0,0,0,0,0,0,2,0,0,17258",
      "182408,0,35,0,0,0,0,0,0,0,0,2,0,0,17260",
      "182620,0,35,0,0,0,0,0,0,0,0,2,0,0,17256",
      "182621,0,35,0,0,0,0,0,0,0,0,2,0,0,17257",
      "182622,0,35,0,0,0,0,0,0,0,0,2,0,0,17259",
      "182675,0,35,0,0,0,0,0,0,0,0,2,0,0,17253",
      "182949,0,35,0,0,0,0,0,0,0,0,2,0,0,17255",
      "187062,0,20,0,0,0,0,0,0,0,0,2,0,0,23099",
      "187970,0,20,0,0,0,0,0,0,0,0,2,0,0,23109",
      "187986,0,20,0,0,0,0,0,0,0,0,2,0,0,23110",
      "314517,0,10,0,0,0,0,0,0,0,0,2,0,0,1310612"
    ]
  },
  "levels": {
    "table": "SpellLevels",
    "filter": null,
    "value": null,
    "header": "ID,DifficultyID,MaxLevel,MaxPassiveAuraLevel,BaseLevel,SpellLevel,SpellID",
    "rows": [
      "102427,0,0,0,56,56,17261",
      "102446,0,0,0,32,32,17258",
      "102649,0,0,0,48,48,17260",
      "102727,0,0,0,16,16,17256",
      "102728,0,0,0,24,24,17257",
      "102729,0,0,0,40,40,17259",
      "102752,0,0,0,1,1,17253",
      "102841,0,0,0,8,8,17255",
      "104265,0,0,0,0,30,23099",
      "104534,0,0,0,0,40,23109",
      "104538,0,0,0,0,50,23110",
      "153294,0,0,0,0,20,1310612"
    ]
  },
  "effect17253": {
    "table": "SpellEffect",
    "filter": "SpellID",
    "value": 17253,
    "header": "ID,EffectAura,DifficultyID,EffectIndex,Effect,EffectAmplitude,EffectAttributes,EffectAuraPeriod,EffectBonusCoefficient,EffectChainAmplitude,EffectChainTargets,EffectItemType,EffectMechanic,EffectPointsPerResource,EffectPos_facing,EffectRealPointsPerLevel,EffectTriggerSpell,BonusCoefficientFromAP,PvpMultiplier,Coefficient,Variance,ResourceCoefficient,GroupSizeBasePointsCoefficient,EffectBasePointsF,ScalingClass,Node__Field_12_0_0_63534_001,EffectMiscValue_0,EffectMiscValue_1,EffectRadiusIndex_0,EffectRadiusIndex_1,EffectSpellClassMask_0,EffectSpellClassMask_1,EffectSpellClassMask_2,EffectSpellClassMask_3,ImplicitTarget_0,ImplicitTarget_1,SpellID",
    "rows": [
      "694910,0,0,0,2,0,0,0,1,1,0,0,0,0,0,0,0,0,1,0,0.25,0,1,8,0,0,0,0,0,0,0,0,0,0,6,0,17253"
    ]
  },
  "effect17255": {
    "table": "SpellEffect",
    "filter": "SpellID",
    "value": 17255,
    "header": "ID,EffectAura,DifficultyID,EffectIndex,Effect,EffectAmplitude,EffectAttributes,EffectAuraPeriod,EffectBonusCoefficient,EffectChainAmplitude,EffectChainTargets,EffectItemType,EffectMechanic,EffectPointsPerResource,EffectPos_facing,EffectRealPointsPerLevel,EffectTriggerSpell,BonusCoefficientFromAP,PvpMultiplier,Coefficient,Variance,ResourceCoefficient,GroupSizeBasePointsCoefficient,EffectBasePointsF,ScalingClass,Node__Field_12_0_0_63534_001,EffectMiscValue_0,EffectMiscValue_1,EffectRadiusIndex_0,EffectRadiusIndex_1,EffectSpellClassMask_0,EffectSpellClassMask_1,EffectSpellClassMask_2,EffectSpellClassMask_3,ImplicitTarget_0,ImplicitTarget_1,SpellID",
    "rows": [
      "695249,0,0,0,2,0,0,0,1,1,0,0,0,0,0,0,0,0,1,0,0.11764705926,0,1,17,0,0,0,0,0,0,0,0,0,0,6,0,17255"
    ]
  },
  "effect17256": {
    "table": "SpellEffect",
    "filter": "SpellID",
    "value": 17256,
    "header": "ID,EffectAura,DifficultyID,EffectIndex,Effect,EffectAmplitude,EffectAttributes,EffectAuraPeriod,EffectBonusCoefficient,EffectChainAmplitude,EffectChainTargets,EffectItemType,EffectMechanic,EffectPointsPerResource,EffectPos_facing,EffectRealPointsPerLevel,EffectTriggerSpell,BonusCoefficientFromAP,PvpMultiplier,Coefficient,Variance,ResourceCoefficient,GroupSizeBasePointsCoefficient,EffectBasePointsF,ScalingClass,Node__Field_12_0_0_63534_001,EffectMiscValue_0,EffectMiscValue_1,EffectRadiusIndex_0,EffectRadiusIndex_1,EffectSpellClassMask_0,EffectSpellClassMask_1,EffectSpellClassMask_2,EffectSpellClassMask_3,ImplicitTarget_0,ImplicitTarget_1,SpellID",
    "rows": [
      "694844,0,0,0,2,0,0,0,1,1,0,0,0,0,0,0,0,0,1,0,0.15384615958,0,1,26,0,0,0,0,0,0,0,0,0,0,6,0,17256"
    ]
  },
  "effect17257": {
    "table": "SpellEffect",
    "filter": "SpellID",
    "value": 17257,
    "header": "ID,EffectAura,DifficultyID,EffectIndex,Effect,EffectAmplitude,EffectAttributes,EffectAuraPeriod,EffectBonusCoefficient,EffectChainAmplitude,EffectChainTargets,EffectItemType,EffectMechanic,EffectPointsPerResource,EffectPos_facing,EffectRealPointsPerLevel,EffectTriggerSpell,BonusCoefficientFromAP,PvpMultiplier,Coefficient,Variance,ResourceCoefficient,GroupSizeBasePointsCoefficient,EffectBasePointsF,ScalingClass,Node__Field_12_0_0_63534_001,EffectMiscValue_0,EffectMiscValue_1,EffectRadiusIndex_0,EffectRadiusIndex_1,EffectSpellClassMask_0,EffectSpellClassMask_1,EffectSpellClassMask_2,EffectSpellClassMask_3,ImplicitTarget_0,ImplicitTarget_1,SpellID",
    "rows": [
      "694845,0,0,0,2,0,0,0,1,1,0,0,0,0,0,0,0,0,1,0,0.17647059262,0,1,34,0,0,0,0,0,0,0,0,0,0,6,0,17257"
    ]
  },
  "effect17258": {
    "table": "SpellEffect",
    "filter": "SpellID",
    "value": 17258,
    "header": "ID,EffectAura,DifficultyID,EffectIndex,Effect,EffectAmplitude,EffectAttributes,EffectAuraPeriod,EffectBonusCoefficient,EffectChainAmplitude,EffectChainTargets,EffectItemType,EffectMechanic,EffectPointsPerResource,EffectPos_facing,EffectRealPointsPerLevel,EffectTriggerSpell,BonusCoefficientFromAP,PvpMultiplier,Coefficient,Variance,ResourceCoefficient,GroupSizeBasePointsCoefficient,EffectBasePointsF,ScalingClass,Node__Field_12_0_0_63534_001,EffectMiscValue_0,EffectMiscValue_1,EffectRadiusIndex_0,EffectRadiusIndex_1,EffectSpellClassMask_0,EffectSpellClassMask_1,EffectSpellClassMask_2,EffectSpellClassMask_3,ImplicitTarget_0,ImplicitTarget_1,SpellID",
    "rows": [
      "693894,0,0,0,2,0,0,0,1,1,0,0,0,0,0,0,0,0,1,0,0.18181818724,0,1,44,0,0,0,0,0,0,0,0,0,0,6,0,17258"
    ]
  },
  "effect17259": {
    "table": "SpellEffect",
    "filter": "SpellID",
    "value": 17259,
    "header": "ID,EffectAura,DifficultyID,EffectIndex,Effect,EffectAmplitude,EffectAttributes,EffectAuraPeriod,EffectBonusCoefficient,EffectChainAmplitude,EffectChainTargets,EffectItemType,EffectMechanic,EffectPointsPerResource,EffectPos_facing,EffectRealPointsPerLevel,EffectTriggerSpell,BonusCoefficientFromAP,PvpMultiplier,Coefficient,Variance,ResourceCoefficient,GroupSizeBasePointsCoefficient,EffectBasePointsF,ScalingClass,Node__Field_12_0_0_63534_001,EffectMiscValue_0,EffectMiscValue_1,EffectRadiusIndex_0,EffectRadiusIndex_1,EffectSpellClassMask_0,EffectSpellClassMask_1,EffectSpellClassMask_2,EffectSpellClassMask_3,ImplicitTarget_0,ImplicitTarget_1,SpellID",
    "rows": [
      "694846,0,0,0,2,0,0,0,1,1,0,0,0,0,0,0,0,0,1,0,0.18518517911,0,1,54,0,0,0,0,0,0,0,0,0,0,6,0,17259"
    ]
  },
  "effect17260": {
    "table": "SpellEffect",
    "filter": "SpellID",
    "value": 17260,
    "header": "ID,EffectAura,DifficultyID,EffectIndex,Effect,EffectAmplitude,EffectAttributes,EffectAuraPeriod,EffectBonusCoefficient,EffectChainAmplitude,EffectChainTargets,EffectItemType,EffectMechanic,EffectPointsPerResource,EffectPos_facing,EffectRealPointsPerLevel,EffectTriggerSpell,BonusCoefficientFromAP,PvpMultiplier,Coefficient,Variance,ResourceCoefficient,GroupSizeBasePointsCoefficient,EffectBasePointsF,ScalingClass,Node__Field_12_0_0_63534_001,EffectMiscValue_0,EffectMiscValue_1,EffectRadiusIndex_0,EffectRadiusIndex_1,EffectSpellClassMask_0,EffectSpellClassMask_1,EffectSpellClassMask_2,EffectSpellClassMask_3,ImplicitTarget_0,ImplicitTarget_1,SpellID",
    "rows": [
      "694574,0,0,0,2,0,0,0,1,1,0,0,0,0,0,0,0,0,1,0,0.19178082049,0,1,73,0,0,0,0,0,0,0,0,0,0,6,0,17260"
    ]
  },
  "effect17261": {
    "table": "SpellEffect",
    "filter": "SpellID",
    "value": 17261,
    "header": "ID,EffectAura,DifficultyID,EffectIndex,Effect,EffectAmplitude,EffectAttributes,EffectAuraPeriod,EffectBonusCoefficient,EffectChainAmplitude,EffectChainTargets,EffectItemType,EffectMechanic,EffectPointsPerResource,EffectPos_facing,EffectRealPointsPerLevel,EffectTriggerSpell,BonusCoefficientFromAP,PvpMultiplier,Coefficient,Variance,ResourceCoefficient,GroupSizeBasePointsCoefficient,EffectBasePointsF,ScalingClass,Node__Field_12_0_0_63534_001,EffectMiscValue_0,EffectMiscValue_1,EffectRadiusIndex_0,EffectRadiusIndex_1,EffectSpellClassMask_0,EffectSpellClassMask_1,EffectSpellClassMask_2,EffectSpellClassMask_3,ImplicitTarget_0,ImplicitTarget_1,SpellID",
    "rows": [
      "693839,0,0,0,2,0,0,0,1,1,0,0,0,0,0,0,0,0,1,0,0.20000000298,0,1,90,0,0,0,0,0,0,0,0,0,0,6,0,17261"
    ]
  },
  "effect23099": {
    "table": "SpellEffect",
    "filter": "SpellID",
    "value": 23099,
    "header": "ID,EffectAura,DifficultyID,EffectIndex,Effect,EffectAmplitude,EffectAttributes,EffectAuraPeriod,EffectBonusCoefficient,EffectChainAmplitude,EffectChainTargets,EffectItemType,EffectMechanic,EffectPointsPerResource,EffectPos_facing,EffectRealPointsPerLevel,EffectTriggerSpell,BonusCoefficientFromAP,PvpMultiplier,Coefficient,Variance,ResourceCoefficient,GroupSizeBasePointsCoefficient,EffectBasePointsF,ScalingClass,Node__Field_12_0_0_63534_001,EffectMiscValue_0,EffectMiscValue_1,EffectRadiusIndex_0,EffectRadiusIndex_1,EffectSpellClassMask_0,EffectSpellClassMask_1,EffectSpellClassMask_2,EffectSpellClassMask_3,ImplicitTarget_0,ImplicitTarget_1,SpellID",
    "rows": [
      "700355,31,0,0,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,40,0,0,0,0,0,0,0,0,0,0,1,0,23099"
    ]
  },
  "effect23109": {
    "table": "SpellEffect",
    "filter": "SpellID",
    "value": 23109,
    "header": "ID,EffectAura,DifficultyID,EffectIndex,Effect,EffectAmplitude,EffectAttributes,EffectAuraPeriod,EffectBonusCoefficient,EffectChainAmplitude,EffectChainTargets,EffectItemType,EffectMechanic,EffectPointsPerResource,EffectPos_facing,EffectRealPointsPerLevel,EffectTriggerSpell,BonusCoefficientFromAP,PvpMultiplier,Coefficient,Variance,ResourceCoefficient,GroupSizeBasePointsCoefficient,EffectBasePointsF,ScalingClass,Node__Field_12_0_0_63534_001,EffectMiscValue_0,EffectMiscValue_1,EffectRadiusIndex_0,EffectRadiusIndex_1,EffectSpellClassMask_0,EffectSpellClassMask_1,EffectSpellClassMask_2,EffectSpellClassMask_3,ImplicitTarget_0,ImplicitTarget_1,SpellID",
    "rows": [
      "701521,31,0,0,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,60,0,0,0,0,0,0,0,0,0,0,1,0,23109"
    ]
  },
  "effect23110": {
    "table": "SpellEffect",
    "filter": "SpellID",
    "value": 23110,
    "header": "ID,EffectAura,DifficultyID,EffectIndex,Effect,EffectAmplitude,EffectAttributes,EffectAuraPeriod,EffectBonusCoefficient,EffectChainAmplitude,EffectChainTargets,EffectItemType,EffectMechanic,EffectPointsPerResource,EffectPos_facing,EffectRealPointsPerLevel,EffectTriggerSpell,BonusCoefficientFromAP,PvpMultiplier,Coefficient,Variance,ResourceCoefficient,GroupSizeBasePointsCoefficient,EffectBasePointsF,ScalingClass,Node__Field_12_0_0_63534_001,EffectMiscValue_0,EffectMiscValue_1,EffectRadiusIndex_0,EffectRadiusIndex_1,EffectSpellClassMask_0,EffectSpellClassMask_1,EffectSpellClassMask_2,EffectSpellClassMask_3,ImplicitTarget_0,ImplicitTarget_1,SpellID",
    "rows": [
      "701540,31,0,0,6,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,80,0,0,0,0,0,0,0,0,0,0,1,0,23110"
    ]
  },
  "effect1310612": {
    "table": "SpellEffect",
    "filter": "SpellID",
    "value": 1310612,
    "header": "ID,EffectAura,DifficultyID,EffectIndex,Effect,EffectAmplitude,EffectAttributes,EffectAuraPeriod,EffectBonusCoefficient,EffectChainAmplitude,EffectChainTargets,EffectItemType,EffectMechanic,EffectPointsPerResource,EffectPos_facing,EffectRealPointsPerLevel,EffectTriggerSpell,BonusCoefficientFromAP,PvpMultiplier,Coefficient,Variance,ResourceCoefficient,GroupSizeBasePointsCoefficient,EffectBasePointsF,ScalingClass,Node__Field_12_0_0_63534_001,EffectMiscValue_0,EffectMiscValue_1,EffectRadiusIndex_0,EffectRadiusIndex_1,EffectSpellClassMask_0,EffectSpellClassMask_1,EffectSpellClassMask_2,EffectSpellClassMask_3,ImplicitTarget_0,ImplicitTarget_1,SpellID",
    "rows": [
      "1340239,49,0,0,6,0,0,0,1,1,0,0,0,0,0,0,0,0,1,0,0,0,1,50,0,0,0,0,0,0,0,0,0,0,1,0,1310612",
      "1340240,319,0,1,6,0,0,0,1,1,0,0,0,0,0,0,0,0,1,0,0,0,1,30,0,0,0,0,0,0,0,0,0,0,1,0,1310612"
    ]
  }
};
