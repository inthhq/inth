package com.inth.consentui

import androidx.compose.foundation.layout.Column
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import com.inth.consentui.headless.OptOutLinkVariant
import com.inth.consentui.headless.PrivacyChoicesLinkAction
import com.inth.consentui.headless.resolveOptOutReceipt
import com.inth.consentui.headless.resolvePrivacyChoicesLink
import com.inth.core.ConsentCore
import com.inth.core.NativeConfig
import com.inth.core.model.ConsentCategory
import com.inth.core.model.ConsentSnapshot
import com.inth.core.model.OptOutHolder
import com.inth.core.model.OptOutMethod
import com.inth.core.model.OptOutRecord
import com.inth.core.model.OptOutRight
import com.inth.core.policy.ResolvedOptOutState
import com.inth.core.spi.HttpClient
import com.inth.core.spi.HttpRequest
import com.inth.core.spi.HttpResponse
import com.inth.core.spi.KeyValueStore
import com.inth.core.spi.TaskExecutor
import com.inth.core.store.InthStore
import com.inth.core.transport.HostedTransport
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.concurrent.TimeUnit

/**
 * The Privacy Choices link, the opt-out confirmation and the two-step opt back in. Mirrors the
 * web `PrivacyChoicesLink`, `OptOutConfirmation` and `OptInConfirmation` tests.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PrivacyChoicesTest {
    @get:Rule val compose = createComposeRule()

    @Before fun main() = Dispatchers.setMain(Dispatchers.Unconfined)
    @After fun reset() = Dispatchers.resetMain()

    // -- The link ------------------------------------------------------------

    @Test fun linkUnderAnOptOutRuleShowsTheChosenStatutoryTitle() {
        val core = policyCore("opt-out")
        val state = core.optOutState()
        val doNotSell = resolvePrivacyChoicesLink(core.snapshot(), state)!!
        assertEquals("Do Not Sell or Share My Personal Information", doNotSell.label)
        assertFalse("the statutory title carries no icon", doNotSell.showsOptOutIcon)
        assertEquals(PrivacyChoicesLinkAction.OPT_OUT, doNotSell.action)

        val choices = resolvePrivacyChoicesLink(core.snapshot(), state, OptOutLinkVariant.PRIVACY_CHOICES)!!
        assertEquals("Your Privacy Choices", choices.label)
        assertTrue(choices.showsOptOutIcon)
        val california = resolvePrivacyChoicesLink(core.snapshot(), state, OptOutLinkVariant.CALIFORNIA_PRIVACY_CHOICES)!!
        assertEquals("Your California Privacy Choices", california.label)
        assertTrue(california.showsOptOutIcon)
    }

    @Test fun linkUnderAnOptInRuleOpensSettingsWithoutTheIcon() {
        val core = policyCore("opt-in")
        val link = resolvePrivacyChoicesLink(core.snapshot(), core.optOutState(), OptOutLinkVariant.PRIVACY_CHOICES)!!
        assertEquals("Your Privacy Choices", link.label)
        assertFalse(link.showsOptOutIcon)
        assertEquals(PrivacyChoicesLinkAction.OPEN_PREFERENCES, link.action)

        val presenter = ConsentPresenter(core, autoPresent = false)
        presenter.openPrivacyChoices()
        assertNotNull(presenter.presentationID)
        assertTrue(presenter.preferences)
        assertNull("the link records nothing under an opt-in rule", core.snapshot().optOut)
    }

    @Test fun linkShowsNothingBeforeAPolicyResolves() {
        val core = ConsentCore(NativeConfig("https://fixture.invalid"), InthStore(Memory()), executor = TaskExecutor.DIRECT)
        assertNull(resolvePrivacyChoicesLink(core.snapshot(), core.optOutState()))
    }

    // -- One tap and the receipt -------------------------------------------

    @Test fun oneTapRecordsTheOptOutAndOpensTheReceipt() {
        val core = policyCore("opt-out")
        val presenter = ConsentPresenter(core, autoPresent = false)
        assertTrue(core.isAllowed(ConsentCategory.MARKETING))

        presenter.openPrivacyChoices(OptOutLinkVariant.PRIVACY_CHOICES)
        await { presenter.optOutConfirmation }

        assertNotNull(core.snapshot().optOut)
        assertFalse(core.isAllowed(ConsentCategory.MARKETING))
        assertNull("the confirmation is its own surface, not settings", presenter.presentationID)
        val receipt = presenter.optOutReceipt!!
        assertEquals("Opt-out request honored", receipt.status)
        assertEquals("You're opted out on this browser.", receipt.sentence)
        assertTrue(receipt.canOptBackIn)

        // A second tap shows the receipt again and records nothing new.
        val revision = core.snapshot().revision
        presenter.closeOptOutConfirmation()
        presenter.openPrivacyChoices()
        assertTrue(presenter.optOutConfirmation)
        assertEquals(revision, core.snapshot().revision)
    }

    @Test fun receiptNamesConfirmedRightsAndTheAccount() {
        val record = OptOutRecord(listOf(OptOutRight.SALE, OptOutRight.SHARE), OptOutMethod.PROPAGATED, 1_770_000_000_000L, OptOutHolder.BOTH)
        val state = ResolvedOptOutState(available = true, honored = true, via = com.inth.core.policy.OptOutVia.REQUEST,
            lock = com.inth.core.policy.OptOutLock.HELD_BY_ACCOUNT, categories = listOf(ConsentCategory.MARKETING),
            decidingCategory = ConsentCategory.MARKETING, optInPromptAllowedAt = null)
        val receipt = resolveOptOutReceipt(ConsentSnapshot(optOut = record), state)!!
        assertEquals("Sale and sharing of your personal information", receipt.heading)
        assertEquals("You're opted out of sale and sharing on this browser and your account.", receipt.sentence)
        assertTrue(receipt.heldByAccount)
        assertTrue("an account-held opt-out can still be lifted after signing in", receipt.canOptBackIn)

        val gpc = resolveOptOutReceipt(ConsentSnapshot(optOut = record.copy(method = OptOutMethod.GPC, heldBy = OptOutHolder.DEVICE)),
            state.copy(via = com.inth.core.policy.OptOutVia.SIGNAL, lock = com.inth.core.policy.OptOutLock.GPC_ACTIVE))!!
        assertEquals("Opt-out preference signal honored", gpc.status)
        assertFalse("Global Privacy Control holds it, so no opt back in", gpc.canOptBackIn)
    }

    // -- Two steps to opt back in (11 CCR §7028(a)) -------------------------

    @Test fun optingBackInTakesASecondConfirmation() {
        val core = policyCore("opt-out")
        val presenter = ConsentPresenter(core, autoPresent = false)
        assertTrue(core.optOut().ok)
        await { presenter.optOutReceipt != null }

        presenter.requestOptIn()
        assertTrue(presenter.optInConfirmation)
        assertNotNull("asking is not opting back in", core.snapshot().optOut)

        presenter.cancelOptIn()
        assertFalse(presenter.optInConfirmation)
        assertNotNull("Stay opted out keeps the opt-out", core.snapshot().optOut)

        presenter.requestOptIn()
        presenter.confirmOptIn()
        await { core.snapshot().optOut == null && !presenter.changingOptOut }
        assertTrue(core.isAllowed(ConsentCategory.MARKETING))
    }

    @Test fun aSettingsSaveThatWouldLiftTheOptOutWaitsForTheSecondStep() {
        val core = policyCore("opt-out")
        assertTrue(core.optOut().ok)
        val presenter = ConsentPresenter(core, autoPresent = false)
        presenter.presentPreferences()
        presenter.setCategory(ConsentCategory.MARKETING, true)

        presenter.commit(ConsentPresenter.Action.SAVE)
        assertTrue(presenter.optInConfirmation)
        assertFalse(presenter.pending)
        assertNotNull("nothing is recorded before the second step", core.snapshot().optOut)

        presenter.confirmOptIn()
        await { !presenter.pending && core.snapshot().optOut == null }
        assertTrue(core.isAllowed(ConsentCategory.MARKETING))
    }

    @Test fun acceptAllUnderAHeldOptOutAlsoAsksFirstAndCancelRecordsNothing() {
        val core = policyCore("opt-out")
        assertTrue(core.optOut().ok)
        val presenter = ConsentPresenter(core, autoPresent = false)
        presenter.presentPreferences()
        val revision = core.snapshot().revision

        presenter.commit(ConsentPresenter.Action.ACCEPT)
        assertTrue(presenter.optInConfirmation)
        presenter.cancelOptIn()

        assertEquals(revision, core.snapshot().revision)
        assertNotNull(core.snapshot().optOut)
        assertNotNull("settings stay open", presenter.presentationID)
    }

    @Test fun globalPrivacyControlHoldsTheOptOutWithoutAnOptBackInStep() {
        val core = policyCore("opt-out", detectedGpc = true)
        val presenter = ConsentPresenter(core, autoPresent = false)
        assertNotNull(core.snapshot().optOut)
        assertFalse(presenter.optOutReceipt!!.canOptBackIn)
        presenter.requestOptIn()
        assertFalse(presenter.optInConfirmation)
    }

    // -- Compose ------------------------------------------------------------

    @Test fun tappingTheLinkShowsTheConfirmationAndDoneClosesIt() {
        val core = policyCore("opt-out")
        val presenter = ConsentPresenter(core, autoPresent = false)
        compose.setContent {
            Column {
                PrivacyChoicesLink(presenter, variant = OptOutLinkVariant.PRIVACY_CHOICES)
                InthConsent(presenter, "https://app.example/privacy")
            }
        }
        compose.onNodeWithTag("inth.privacy-choices-link.icon", useUnmergedTree = true).assertExists()
        compose.onNodeWithText("Your Privacy Choices").performClick()
        compose.waitUntil(5_000) { presenter.optOutConfirmation }

        compose.onNodeWithTag("inth.opt-out-confirmation").assertIsDisplayed()
        compose.onNodeWithTag("inth.opt-out-confirmation.title").assertTextEquals("Your Privacy Choices")
        compose.onNodeWithTag("inth.opt-out-confirmation.description").assertTextEquals("You're opted out on this browser.")
        compose.onNodeWithTag("inth.opt-out-confirmation.recorded-at").assertExists()
        assertNotNull(core.snapshot().optOut)

        compose.onNodeWithTag("inth.opt-out-confirmation.done").performClick()
        compose.waitForIdle()
        assertFalse(presenter.optOutConfirmation)
        compose.onNodeWithTag("inth.opt-out-confirmation").assertDoesNotExist()
    }

    @Test fun settingsShowTheHonoredOptOutAndTheOptBackInLinkOpensTheSecondStep() {
        val core = policyCore("opt-out")
        assertTrue(core.optOut().ok)
        val presenter = ConsentPresenter(core, autoPresent = false)
        compose.setContent { InthConsent(presenter, "https://app.example/privacy") }
        compose.runOnIdle { presenter.presentPreferences() }

        compose.onNodeWithTag("inth.prefs.opt-out-status").assertIsDisplayed()
        compose.onNodeWithTag("inth.prefs.opt-out.description").assertTextEquals("You're opted out on this browser.")
        compose.onNodeWithTag("inth.prefs").performScrollToNode(hasTestTag("inth.prefs.opt-in-link"))
        compose.onNodeWithTag("inth.prefs.opt-in-link").performClick()
        compose.runOnIdle { assertTrue(presenter.optInConfirmation) }
        compose.onNodeWithTag("inth.opt-in-confirmation").assertIsDisplayed()
        compose.onNodeWithTag("inth.opt-in-confirmation.title").assertTextEquals("Opt back in?")
        assertNotNull(core.snapshot().optOut)

        compose.onNodeWithTag("inth.opt-in-confirmation.confirm").performClick()
        compose.waitUntil(5_000) { core.snapshot().optOut == null && !presenter.changingOptOut }
        compose.waitForIdle()
        compose.onNodeWithTag("inth.prefs.opt-out.button").assertExists()
    }

    // -- Fixtures -----------------------------------------------------------

    private fun await(condition: () -> Boolean) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
        while (System.nanoTime() < deadline) {
            if (condition()) return
            Thread.sleep(10)
        }
        assertTrue("did not reach the expected state", condition())
    }

    private class Memory : KeyValueStore {
        private val values = java.util.concurrent.ConcurrentHashMap<String, String>()
        override fun read(key: String) = values[key]
        override fun write(key: String, value: String?) { if (value == null) values.remove(key) else values[key] = value }
        override fun writeDurably(key: String, value: String?): Boolean { write(key, value); return true }
    }

    private fun policyCore(model: String, detectedGpc: Boolean = false): ConsentCore {
        val body = """
            {
              "location": { "countryCode": "US", "regionCode": "CA" },
              "policySnapshotToken": "fixture-token",
              "policyResolution": {
                "version": 1,
                "status": "matched",
                "policyId": "us-ca-$model",
                "matchedBy": "region",
                "fingerprints": {
                  "policy": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
                  "choice": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                  "notice": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
                },
                "policy": {
                  "id": "us-ca-$model",
                  "model": "$model",
                  "prompt": "none",
                  "scope": ["experience","functionality","marketing","measurement"],
                  "scopeMode": "permissive",
                  "preselectedCategories": [],
                  "actions": {
                    "allowed": ["accept", "customize", "reject"],
                    "required": ["accept", "reject"],
                    "equivalent": [["accept", "reject"]]
                  },
                  "rights": ["disclosure", "opt-out", "preferences"],
                  "validity": { "choiceMs": 31536000000, "noticeMs": 31536000000 },
                  "privacySignals": { "gpc": { "denyCategories": ["marketing"] } },
                  "proof": { "storeIp": false, "storeUserAgent": false, "storeLanguage": true },
                  "copyRevision": null
                }
              }
            }
        """.trimIndent()
        val client = object : HttpClient {
            override fun send(request: HttpRequest) = if (request.method == HttpRequest.GET)
                HttpResponse(200, emptyMap(), body) else HttpResponse(503)
        }
        val config = NativeConfig(
            backendUrl = "https://fixture.invalid",
            consentCategories = ConsentCategory.entries,
            detectedGpc = detectedGpc,
        )
        return ConsentCore(config, InthStore(Memory()), transport = HostedTransport(client, config), executor = TaskExecutor.DIRECT)
            .also { it.bootstrap() }
    }
}
