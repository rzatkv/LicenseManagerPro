<?php
/**
 * License Manager Pro — administrator license controller.
 *
 * Mint / renew / activate / deactivate / revoke / validate. Every
 * task checks the form token, and every API failure is reported back
 * as an error message with no state changed on the backend
 * (the API client fails closed on 401/403).
 */

declare(strict_types=1);

namespace Licensemanagerpro\Component\Licensemanagerpro\Administrator\Controller;

use Joomla\CMS\Factory;
use Joomla\CMS\Language\Text;
use Joomla\CMS\MVC\Controller\BaseController;
use Joomla\CMS\Router\Route;
use Licensemanagerpro\Component\Licensemanagerpro\Administrator\Model\LicenseModel;
use Throwable;

class LicenseController extends BaseController
{
    public function mint(): void
    {
        $this->checkToken();
        $app = Factory::getApplication();
        $input = $app->getInput();
        $email = trim((string) $input->post->getString('owner_email', ''));
        $productSlug = trim((string) $input->post->getString('product_slug', ''));
        $cycle = trim((string) $input->post->getString('billing_cycle', ''));
        $key = trim((string) $input->post->getString('license_key', ''));

        $redirect = Route::_('index.php?option=com_licensemanagerpro', false);
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $app->enqueueMessage(Text::_('COM_LICENSMANAGERPRO_ERROR_INVALID_EMAIL'), 'error');
            $this->setRedirect($redirect);
            return;
        }
        if ($productSlug === '') {
            $app->enqueueMessage(Text::_('COM_LICENSMANAGERPRO_ERROR_NO_PRODUCT'), 'error');
            $this->setRedirect($redirect);
            return;
        }
        try {
            $license = $this->getModel()->mintLicense($email, $productSlug, $cycle, $key === '' ? null : $key);
            $app->enqueueMessage(
                Text::sprintf('COM_LICENSMANAGERPRO_MINT_SUCCESS', $license['key'] ?? ''),
                'message'
            );
        } catch (Throwable $e) {
            $app->enqueueMessage(Text::sprintf('COM_LICENSMANAGERPRO_MINT_FAILED', $e->getMessage()), 'error');
        }
        $this->setRedirect($redirect);
    }

    public function renew(): void
    {
        $this->checkToken();
        $app = Factory::getApplication();
        $input = $app->getInput();
        $id = (int) $input->post->getInt('id', 0);
        $cycle = trim((string) $input->post->getString('billing_cycle', ''));
        try {
            $license = $this->getModel()->renewLicense($id, $cycle === '' ? null : $cycle);
            $app->enqueueMessage(
                Text::sprintf('COM_LICENSMANAGERPRO_RENEW_SUCCESS', $license['expires_at'] ?? ''),
                'message'
            );
        } catch (Throwable $e) {
            $app->enqueueMessage(Text::sprintf('COM_LICENSMANAGERPRO_RENEW_FAILED', $e->getMessage()), 'error');
        }
        $this->setRedirect(Route::_('index.php?option=com_licensemanagerpro', false));
    }

    public function activate(): void
    {
        $this->setStatus('active', 'COM_LICENSMANAGERPRO_ACTIVATE_SUCCESS');
    }

    public function deactivate(): void
    {
        $this->setStatus('inactive', 'COM_LICENSMANAGERPRO_DEACTIVATE_SUCCESS');
    }

    public function revoke(): void
    {
        $this->checkToken();
        $app = Factory::getApplication();
        $id = (int) $app->getInput()->post->getInt('id', 0);
        try {
            $this->getModel()->revokeLicense($id);
            $app->enqueueMessage(Text::_('COM_LICENSMANAGERPRO_REVOKE_SUCCESS'), 'message');
        } catch (Throwable $e) {
            $app->enqueueMessage(Text::sprintf('COM_LICENSMANAGERPRO_REVOKE_FAILED', $e->getMessage()), 'error');
        }
        $this->setRedirect(Route::_('index.php?option=com_licensemanagerpro', false));
    }

    /** Dashboard "validate a key" tool. */
    public function validate(): void
    {
        $this->checkToken();
        $app = Factory::getApplication();
        $input = $app->getInput();
        $key = trim((string) $input->post->getString('license_key', ''));
        $domain = trim((string) $input->post->getString('domain', ''));
        if ($key === '') {
            $app->enqueueMessage(Text::_('COM_LICENSMANAGERPRO_ERROR_NO_KEY'), 'error');
            $this->setRedirect(Route::_('index.php?option=com_licensemanagerpro', false));
            return;
        }
        try {
            $result = $this->getModel()->validateLicenseKey($key, $domain === '' ? null : $domain);
            if (!empty($result['valid'])) {
                $app->enqueueMessage(Text::_('COM_LICENSMANAGERPRO_VALIDATE_OK'), 'message');
            } else {
                $app->enqueueMessage(
                    Text::sprintf('COM_LICENSMANAGERPRO_VALIDATE_INVALID', $result['detail'] ?? ''),
                    'warning'
                );
            }
        } catch (Throwable $e) {
            $app->enqueueMessage(Text::sprintf('COM_LICENSMANAGERPRO_VALIDATE_FAILED', $e->getMessage()), 'error');
        }
        $this->setRedirect(Route::_('index.php?option=com_licensemanagerpro', false));
    }

    private function setStatus(string $status, string $successKey): void
    {
        $this->checkToken();
        $app = Factory::getApplication();
        $id = (int) $app->getInput()->post->getInt('id', 0);
        try {
            $this->getModel()->setLicenseStatus($id, $status);
            $app->enqueueMessage(Text::_($successKey), 'message');
        } catch (Throwable $e) {
            $app->enqueueMessage(Text::sprintf('COM_LICENSMANAGERPRO_STATUS_FAILED', $e->getMessage()), 'error');
        }
        $this->setRedirect(Route::_('index.php?option=com_licensemanagerpro', false));
    }

    private function getModel(): LicenseModel
    {
        /** @var LicenseModel $model */
        $model = $this->getModel('License', 'Administrator');
        return $model;
    }
}
